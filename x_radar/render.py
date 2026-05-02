from __future__ import annotations

from datetime import datetime, timezone
from textwrap import shorten
from .models import Post


def _fmt_metrics(post: Post) -> str:
    m = post.metrics
    parts = [f"{m.replies} replies", f"{m.reposts} reposts", f"{m.likes} likes"]
    if m.bookmarks:
        parts.append(f"{m.bookmarks} bookmarks")
    if m.views:
        parts.append(f"{m.views} views")
    return " · ".join(parts)


def _why_it_matters(post: Post) -> str:
    topic = post.topic or "this topic"
    return f"This is a fresh signal around {topic}; strong engagement suggests it may be worth tracking or joining early."


def _suggested_angle(post: Post) -> str:
    topic = post.topic or "the thread"
    return f"Reply with a concrete observation or ask what practical workflow/tooling this unlocks for {topic}."


def _truncate(digest: str, max_chars: int) -> str:
    if len(digest) <= max_chars:
        return digest
    return digest[: max_chars - 20].rstrip() + "\n\n…[truncated]"


def render_digest(posts: list[Post], generated_at: datetime | None = None, max_chars: int = 1800) -> str:
    if max_chars < 500:
        raise ValueError("max_chars must be at least 500")
    generated_at = generated_at or datetime.now(timezone.utc)
    stamp = generated_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    if not posts:
        return f"# X Radar — {stamp}\n\nNo high-signal posts found in this run."
    lines = [f"# X Radar — {stamp}", "", "Read-only test digest for Merquery. No X write actions taken.", ""]
    for i, post in enumerate(posts, start=1):
        text = shorten(" ".join(post.text.split()), width=220, placeholder="…")
        lines.extend([
            f"## {i}. {post.topic}: @{post.author_username}",
            f"**Engagement:** {_fmt_metrics(post)}",
            f"**Link:** {post.url}",
            f"**Post:** {text}",
            f"**Why it matters:** {_why_it_matters(post)}",
            f"**Suggested angle:** {_suggested_angle(post)}",
            "",
        ])
    return _truncate("\n".join(lines).strip(), max_chars)


def _learning_implication(post: Post) -> str:
    text = post.text.lower()
    if "cli" in text or "verify" in text:
        return "Expose agent-facing CLI/API surfaces so OpenClaw and Merquery can verify work without UI-only paths."
    if "markdown" in text or "docs" in text:
        return "Prefer durable markdown work journals and agent-readable documentation surfaces."
    if "openclaw" in text or "foundation" in text:
        return "Treat openness, ownership, and multi-model/community structure as first-class OpenClaw constraints."
    return "Review this as source signal for OpenClaw planning before turning it into execution tasks."


def render_learning_digest(posts: list[Post], generated_at: datetime | None = None, max_chars: int = 1800) -> str:
    if max_chars < 500:
        raise ValueError("max_chars must be at least 500")
    generated_at = generated_at or datetime.now(timezone.utc)
    stamp = generated_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    if not posts:
        return f"# High-Signal Learning Radar — {stamp}\n\nNo high-signal source posts found in this run."
    lines = [
        f"# High-Signal Learning Radar — {stamp}",
        "",
        "Read-only source-learning digest. No X write actions taken.",
        "",
    ]
    for i, post in enumerate(posts, start=1):
        text = shorten(" ".join(post.text.split()), width=260, placeholder="…")
        lines.extend([
            f"## {i}. {post.topic}: @{post.author_username}",
            f"Source: {post.url}",
            "",
            "**What happened:**",
            f"- {text}",
            "",
            "**Why it matters:**",
            f"- {_why_it_matters(post)}",
            "",
            "**OpenClaw implication:**",
            f"- {_learning_implication(post)}",
            "",
            "**Disposition:** watch item",
            "",
        ])
    return _truncate("\n".join(lines).strip(), max_chars)
