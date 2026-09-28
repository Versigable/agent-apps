#!/usr/bin/env python3
"""Local-only, append-only native ZIP publisher. Never extracts archives."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import sys
import tempfile
import zipfile


def validate_extra(extra):
    """Require complete TLVs and reject alternate path semantics, not Unicode."""
    offset = 0
    while offset < len(extra):
        if len(extra) - offset < 4:
            raise ValueError('malformed ZIP extra field header')
        field, size = struct.unpack_from('<HH', extra, offset)
        offset += 4
        if size > len(extra) - offset:
            raise ValueError('malformed ZIP extra field length')
        # Python ignores this path override; other readers honor it. Reject all
        # versions/CRCs/payloads, including duplicates and even matching names.
        if field == 0x7075:
            raise ValueError('Unicode Path ZIP extra field is unsupported')
        offset += size


def validate_local_extra(stream, member):
    # Local extras need not match central extras and testzip ignores them.
    stream.seek(member.header_offset)
    header = stream.read(30)
    if len(header) != 30 or header[:4] != b'PK\x03\x04':
        raise ValueError('invalid ZIP local header')
    name_size, extra_size = struct.unpack_from('<HH', header, 26)
    fields = stream.read(name_size + extra_size)
    if len(fields) != name_size + extra_size:
        raise ValueError('truncated ZIP local header fields')
    validate_extra(fields[name_size:])


def publish(args):
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', args.game) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}', args.platform):
        raise ValueError('game and platform must be routable slugs, up to 64 characters')
    for value in (args.game, args.version, args.platform):
        if not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}(?:\.[a-zA-Z0-9_-]+)*", value) or len(value) > 80:
            raise ValueError("invalid build identity")
    if any('--' in value for value in (args.game, args.version, args.platform)):
        raise ValueError('double hyphen is reserved')
    if len(args.notes) > 4000 or any(ord(c) < 32 and c not in '\n\t' for c in args.notes):
        raise ValueError('invalid release notes')
    root = Path(args.store).absolute()
    if root.resolve() != root or any(p.name in ('brain', '.hermes', '.git') or p.name.endswith('-brain') or (p / '.git').exists() for p in (root, *root.parents)):
        raise ValueError('store must be outside repositories, brain and Hermes state, without symlinks')
    source = Path(args.zip).absolute()
    if source.resolve() != source or not source.is_file() or source.stat().st_size > 2 * 1024**3:
        raise ValueError('input must be a regular local ZIP up to 2 GiB without symlinks')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if root.stat().st_mode & 0o022:
        raise ValueError('store must not be group/world writable')
    key = f"{args.game}--{args.version}--{args.platform}"
    target = root / key
    stage = Path(tempfile.mkdtemp(prefix=".publish-", dir=root))
    try:
        archive = stage / "build.zip"
        # Copy into unpublished storage before validation: metadata describes these bytes.
        with os.fdopen(os.open(source, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as src, archive.open('xb') as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024)
        if archive.stat().st_size > 2 * 1024**3:
            raise ValueError('ZIP too large')
        with zipfile.ZipFile(archive) as z, archive.open('rb') as headers:
            members = z.infolist()
            if not members or len(members) > 20000 or sum(m.file_size for m in members) > 8 * 1024**3:
                raise ValueError('empty ZIP or ZIP limits exceeded')
            seen = set()
            for m in members:
                validate_extra(m.extra)
                validate_local_extra(headers, m)
                # ZipInfo.filename may silently discard a NUL suffix. Validate
                # the original central-directory name before any normalization;
                # testzip below also checks local-header agreement and CRC.
                raw_name = m.orig_filename
                if raw_name != m.filename or any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in raw_name):
                    raise ValueError('unsafe or inconsistent ZIP member name')
                name = raw_name[:-1] if m.is_dir() else raw_name
                kind = (m.external_attr >> 16) & 0o170000
                if (not name or name.startswith('/') or '\\' in name or ':' in name
                        or any(ord(c) < 32 for c in name)
                        or any(p.startswith('.') or not p for p in name.split('/'))
                        or name.casefold() in seen or kind not in (0, 0o100000, 0o040000)
                        or m.flag_bits & 1 or m.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED)
                        or m.file_size > max(m.compress_size * 1000, 1024 * 1024)):
                    raise ValueError('unsafe or unsupported ZIP member')
                seen.add(name.casefold())
            if z.testzip() is not None:
                raise ValueError("ZIP CRC validation failed")
        with archive.open('rb') as stream:
            digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        meta = dict(game=args.game, version=args.version, platform=args.platform,
                    date=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='microseconds'),
                    size=archive.stat().st_size, notes=args.notes, sha256=digest)
        # Contract shared with game-build-store.mjs: 4000 Unicode code points
        # in notes, and at most 16384 bytes for the ENTIRE UTF-8 JSON document.
        metadata = json.dumps(meta, ensure_ascii=False).encode('utf8')
        if len(metadata) > 16384:
            raise ValueError('serialized metadata exceeds 16384 bytes')
        (stage / 'metadata.json').write_bytes(metadata)
        archive.chmod(0o444)
        (stage / 'metadata.json').chmod(0o444)
        stage.chmod(0o555)
        # Non-empty destination directories cannot be replaced by rename.
        os.rename(stage, target)
        return meta
    finally:
        if stage.exists():
            stage.chmod(0o700)
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ('store', 'game', 'version', 'platform', 'zip'):
        parser.add_argument('--' + field, required=True)
    parser.add_argument('--notes', default='')
    args = parser.parse_args()
    try:
        print(json.dumps(publish(args)))
    except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as exc:
        print(f'Publish rejected: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
