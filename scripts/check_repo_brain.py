#!/usr/bin/env python3
"""Read-only mechanical repo-brain gate. See docs/brain/checks.md."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
from pathlib import Path
import sys

from markdown_it import MarkdownIt

MANIFEST = "docs/brain/manifest.json"
INVENTORY = "docs/brain/inventory.json"


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def required_text(record, key, label):
    value = record.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}: {key} must be a nonempty string")
    return value


def load_manifest(root):
    import datetime
    import re

    try:
        manifest = json.loads((root / MANIFEST).read_text(encoding="utf-8"))
    except ValueError as exc:
        raise ValueError(f"{MANIFEST}: invalid JSON: {exc}") from exc
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise ValueError(f"{MANIFEST}: expected object with schema_version 1")
    pages = manifest.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ValueError(f"{MANIFEST}: pages must be a nonempty array")
    seen = set()
    for page in pages:
        if not isinstance(page, dict):
            raise ValueError(f"{MANIFEST}: each page must be an object")
        label = required_text(page, "path", MANIFEST)
        if Path(label).suffix.lower() != ".md":
            raise ValueError(f"{MANIFEST}: page path must be Markdown (.md): {label}")
        if label in seen:
            raise ValueError(f"{MANIFEST}: duplicate page {label}")
        seen.add(label)
        required_text(page, "owner", label)
        revision = required_text(page, "source_revision", label)
        if not re.fullmatch(r"(?:[0-9a-fA-F]{40}|[0-9a-fA-F]{64})", revision):
            raise ValueError(f"{label}: source_revision must be full 40/64-digit hex")
        date = required_text(page, "verified_on", label)
        try:
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                raise ValueError()
            datetime.date.fromisoformat(date)
        except ValueError as exc:
            raise ValueError(f"{label}: verified_on must be a real YYYY-MM-DD date") from exc
        if page.get("status") not in ("verified", "stale"):
            raise ValueError(f"{label}: status must be verified or stale")
        evidence = page.get("evidence")
        if not isinstance(evidence, list) or not evidence:
            raise ValueError(f"{label}: evidence must be a nonempty array")
        for item in evidence:
            if not isinstance(item, dict):
                raise ValueError(f"{label}: evidence entry must be an object")
            required_text(item, "path", f"{label} evidence")
            digest = required_text(item, "sha256", f"{label} evidence")
            if not re.fullmatch(r"[0-9a-f]{64}", digest):
                raise ValueError(f"{label}: evidence sha256 must be 64 lowercase hex digits")
    return manifest


def safe_path(root, name, *, base=None, must_exist=True):
    if not isinstance(name, str) or not name or "\\" in name or "\x00" in name or Path(name).is_absolute():
        raise ValueError(f"invalid repository-relative path: {name!r}")
    try:
        path = ((base or root) / name).resolve()
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"invalid path {name!r}: {exc}") from exc
    if not path.is_relative_to(root):
        raise ValueError(f"path escapes repository: {name}")
    if must_exist and not path.is_file():
        raise ValueError(f"missing file path: {name}")
    return path


MARKDOWN = MarkdownIt("commonmark")


def walk_tokens(tokens):
    for token in tokens:
        yield token
        yield from walk_tokens(token.children or [])


def inline_text(tokens):
    """Rendered inline text, without interpreting code/escapes as markup."""
    parts = []
    for token in tokens:
        if token.type in ("text", "code_inline"):
            parts.append(token.content)
        elif token.type in ("softbreak", "hardbreak"):
            parts.append("\n")
        elif token.type == "image":
            parts.append(inline_text(token.children or []))
    return "".join(parts)


class HTMLAnchors(HTMLParser):
    """Read actual attributes only from parser-recognized raw HTML."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.anchors = set()

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ("id", "name") and value is not None:
                self.anchors.add(value)


def anchors(text):
    tokens = MARKDOWN.parse(text)
    result, used = set(), set()
    for token in walk_tokens(tokens):
        if token.type in ("html_inline", "html_block"):
            parser = HTMLAnchors()
            parser.feed(token.content)
            parser.close()
            result.update(parser.anchors)
    for i, token in enumerate(tokens):
        if token.type != "heading_open":
            continue
        heading = inline_text(tokens[i + 1].children or []).lower()
        slug = re.sub(r"[^\w\-\s]", "", heading)
        slug = re.sub(r"\s", "-", slug)
        candidate, n = slug, 0
        while candidate in used:
            n += 1
            candidate = f"{slug}-{n}"
        used.add(candidate)
        result.add(candidate)
    return result


def visible_stale_warning(text, reason):
    """Require the exact source line and a rendered blockquote text warning."""
    lines = text.splitlines()
    depth = 0
    for token in MARKDOWN.parse(text):
        if token.type == "blockquote_open":
            depth += 1
        elif token.type == "blockquote_close":
            depth -= 1
        elif token.type == "inline" and depth and token.map:
            if (f"> STALE: {reason}" in lines[token.map[0]:token.map[1]]
                    and f"STALE: {reason}" in inline_text(token.children or []).splitlines()):
                return True
    return False


def check_links(root, path):
    tokens = MARKDOWN.parse(path.read_text(encoding="utf-8"))
    destinations = []
    for token in walk_tokens(tokens):
        if token.type == "link_open":
            destinations.append(token.attrGet("href"))
        elif token.type == "image":
            destinations.append(token.attrGet("src"))
    for destination in destinations:
        try:
            parts = urlsplit(destination)
            if parts.scheme or parts.netloc:
                continue
            target = safe_path(root, unquote(parts.path), base=path.parent) if parts.path else path
            if parts.fragment:
                fragment = unquote(parts.fragment)
                if fragment not in anchors(target.read_text(encoding="utf-8")):
                    raise ValueError(f"broken anchor #{fragment} in {destination}")
        except (ValueError, OSError) as exc:
            raise ValueError(f"{path.relative_to(root)}: link {destination!r}: {exc}") from exc


def check(root, write_inventory=False):
    safe_path(root, MANIFEST)
    target = safe_path(root, INVENTORY, must_exist=False)
    lexical_target = root / INVENTORY
    if any(p.is_symlink() for p in (lexical_target, *lexical_target.parents) if p != root and p.is_relative_to(root)):
        raise ValueError(f"{INVENTORY}: inventory path must not use symlinks")
    if target.exists() and target.stat().st_nlink != 1:
        raise ValueError(f"{INVENTORY}: inventory path must not use hardlinks")
    manifest = load_manifest(root)
    for page in manifest["pages"]:
        path = safe_path(root, page["path"])
        check_links(root, path)
        if page["status"] == "stale":
            reason = required_text(page, "stale_reason", page["path"])
            if not visible_stale_warning(path.read_text(encoding="utf-8"), reason):
                raise ValueError(f"{page['path']}: stale card needs visible '> STALE: {reason}' warning")
            print(f"repo-brain: WARNING STALE: {page['path']}: {reason}", file=sys.stderr)
        for evidence in page["evidence"]:
            source = safe_path(root, evidence["path"])
            if sha256(source) != evidence["sha256"] and page["status"] == "verified":
                raise ValueError(f"{page['path']}: evidence hash drift: {evidence['path']}; reinspect or explicitly mark stale")
    inventory = {
        "schema_version": 1,
        "generator": "scripts/check_repo_brain.py",
        "manifest": {"path": MANIFEST, "sha256": sha256(root / MANIFEST)},
        "pages": [dict(page, content_sha256=sha256(root / page["path"]))
                  for page in sorted(manifest["pages"], key=lambda p: p["path"])],
    }
    expected = json.dumps(inventory, indent=2, sort_keys=True) + "\n"
    target = root / INVENTORY
    if write_inventory:
        target.write_text(expected, encoding="utf-8")
    elif not target.is_file() or target.read_text(encoding="utf-8") != expected:
        raise ValueError(f"{INVENTORY}: missing, stale or tampered; review inputs then run --write-inventory")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--write-inventory", action="store_true")
    args = parser.parse_args()
    try:
        check(args.root.resolve(), args.write_inventory)
    except (ValueError, OSError) as exc:
        print(f"repo-brain: ERROR: {exc}", file=sys.stderr)
        return 1
    print("repo-brain: mechanical checks passed (not semantic or runtime certification)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
