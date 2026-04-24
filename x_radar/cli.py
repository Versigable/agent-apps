from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

from .collect import collect_posts
from .config import RadarConfig
from .rank import rank_posts
from .render import render_digest


def build_digest(limit: int = 5, max_chars: int = 1800) -> str:
    config = RadarConfig(digest_limit=limit)
    posts = collect_posts(config)
    ranked = rank_posts(posts, limit=limit)
    return render_digest(ranked, generated_at=datetime.now(timezone.utc), max_chars=max_chars)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Generate an X Radar digest for Merquery.")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--max-chars", type=int, default=1800)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    if args.limit < 1:
        parser.error("--limit must be at least 1")
    if args.max_chars < 500:
        parser.error("--max-chars must be at least 500")
    digest = build_digest(limit=args.limit, max_chars=args.max_chars)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(digest + "\n")
    print(digest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
