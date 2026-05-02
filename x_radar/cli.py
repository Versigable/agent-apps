from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

from .collect import collect_posts
from .config import RadarConfig
from .rank import rank_posts
from .render import render_digest, render_learning_digest


def _normalize_handle(handle: str) -> str:
    normalized = handle.strip().removeprefix("@")
    if not normalized or not all(ch.isalnum() or ch == "_" for ch in normalized):
        raise ValueError("account must be an X handle, e.g. steipete")
    return normalized


def build_digest(limit: int = 5, max_chars: int = 1800, account: str | None = None, learning_digest: bool = False) -> str:
    if account:
        handle = _normalize_handle(account)
        config = RadarConfig(digest_limit=limit, source_accounts=[handle], legacy_accounts=[handle])
    else:
        config = RadarConfig(digest_limit=limit)
    posts = collect_posts(config)
    ranked = rank_posts(posts, limit=limit)
    renderer = render_learning_digest if learning_digest else render_digest
    return renderer(ranked, generated_at=datetime.now(timezone.utc), max_chars=max_chars)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate an X Radar digest for Merquery.")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--max-chars", type=int, default=1800)
    parser.add_argument("--account", help="Focus the digest on one X handle, e.g. steipete")
    parser.add_argument("--learning-digest", action="store_true", help="Render source-learning format instead of engagement/reply-angle format")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    if args.limit < 1:
        parser.error("--limit must be at least 1")
    if args.max_chars < 500:
        parser.error("--max-chars must be at least 500")
    if args.account:
        try:
            _normalize_handle(args.account)
        except ValueError as exc:
            parser.error(str(exc))
    digest = build_digest(
        limit=args.limit,
        max_chars=args.max_chars,
        account=args.account,
        learning_digest=args.learning_digest,
    )
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(digest + "\n")
    print(digest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
