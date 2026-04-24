from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from .models import Post

SPAM_PATTERNS = [
    re.compile(r"\b(airdrop|giveaway|100x|pump|moon|crypto shield|telegram group)\b", re.I),
    re.compile(r"(#[A-Za-z0-9_]+\s*){5,}"),
]


def is_low_signal(post: Post) -> bool:
    text = post.text.strip()
    if len(text) < 20:
        return True
    return any(pattern.search(text) for pattern in SPAM_PATTERNS)


def _topic_relevance(post: Post) -> float:
    haystack = post.text.lower()
    topic_terms = [t for t in re.split(r"\W+", post.topic.lower()) if len(t) > 2]
    if not topic_terms:
        return 0.0
    hits = sum(1 for term in topic_terms if term in haystack)
    bonus_terms = ["openclaw", "agent", "agents", "llm", "api", "vibe", "coding", "ai"]
    bonus = sum(1 for term in bonus_terms if term in haystack) * 0.4
    return hits * 2.0 + bonus


def score_post(post: Post, now: datetime | None = None) -> float:
    now = now or datetime.now(timezone.utc)
    age_hours = max((now - post.created_at).total_seconds() / 3600, 0.0)
    recency = 25.0 / (1.0 + age_hours / 6.0)
    m = post.metrics
    engagement = (m.likes * 1.0) + (m.reposts * 4.0) + (m.replies * 2.0) + (m.quotes * 3.0) + (m.bookmarks * 3.0)
    views = math.log10(max(m.views, 0) + 1) * 2.0
    return recency + math.log1p(engagement) * 8.0 + views + _topic_relevance(post)


def rank_posts(posts: list[Post], limit: int = 5, now: datetime | None = None) -> list[Post]:
    seen: set[str] = set()
    filtered: list[Post] = []
    for post in posts:
        if post.id in seen or is_low_signal(post):
            continue
        seen.add(post.id)
        filtered.append(post)
    return sorted(filtered, key=lambda p: score_post(p, now=now), reverse=True)[:limit]
