from __future__ import annotations

import json
import shutil
import subprocess
from datetime import datetime, timezone
from typing import Any, Iterable

from .config import RadarConfig
from .models import Metrics, Post


def _parse_x_time(value: str) -> datetime:
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def parse_legacy_xurl_user_output(payload: dict[str, Any], topic: str) -> list[Post]:
    user = payload.get("user") or {}
    username = str(user.get("username") or "unknown")
    name = str(user.get("name") or username)
    posts: list[Post] = []
    for tweet in payload.get("tweets") or []:
        tweet_id = str(tweet.get("id") or "")
        text = str(tweet.get("text") or "").strip()
        created_raw = tweet.get("created_at")
        if not tweet_id or not text or not created_raw:
            continue
        metrics_raw = tweet.get("public_metrics") or {}
        try:
            created_at = _parse_x_time(str(created_raw))
        except (TypeError, ValueError):
            continue
        metrics = Metrics(
            replies=_safe_int(metrics_raw.get("reply_count")),
            reposts=_safe_int(metrics_raw.get("retweet_count")),
            likes=_safe_int(metrics_raw.get("like_count")),
            quotes=_safe_int(metrics_raw.get("quote_count")),
            bookmarks=_safe_int(metrics_raw.get("bookmark_count")),
            views=_safe_int(metrics_raw.get("impression_count")),
        )
        posts.append(
            Post(
                id=tweet_id,
                text=text,
                author_username=username,
                author_name=name,
                created_at=created_at,
                url=f"https://x.com/{username}/status/{tweet_id}",
                topic=topic,
                metrics=metrics,
            )
        )
    return posts


def detect_legacy_xurl() -> bool:
    xurl = shutil.which("xurl")
    if not xurl:
        return False
    proc = subprocess.run([xurl, "--help"], text=True, capture_output=True, timeout=10, check=False)
    help_text = f"{proc.stdout}\n{proc.stderr}"
    return "xurl user USERNAME" in help_text


def _best_topic_for_text(text: str, topics: Iterable[str]) -> str | None:
    lowered = text.lower()
    best_topic: str | None = None
    best_score = 0
    for topic in topics:
        terms = [term for term in topic.lower().split() if len(term) > 1]
        score = sum(1 for term in terms if term in lowered)
        if score > best_score:
            best_score = score
            best_topic = topic
    return best_topic


def collect_posts_from_legacy_payloads(payloads: Iterable[dict[str, Any]], topics: Iterable[str]) -> list[Post]:
    posts: list[Post] = []
    topic_list = list(topics)
    for payload in payloads:
        for tweet in payload.get("tweets") or []:
            topic = _best_topic_for_text(str(tweet.get("text") or ""), topic_list)
            if topic is None:
                continue
            one_tweet_payload = {"user": payload.get("user") or {}, "tweets": [tweet]}
            posts.extend(parse_legacy_xurl_user_output(one_tweet_payload, topic=topic))
    return posts


def collect_with_legacy_xurl(config: RadarConfig) -> list[Post]:
    xurl = shutil.which("xurl")
    if not xurl:
        raise RuntimeError("xurl is not installed")
    payloads: list[dict[str, Any]] = []
    for account in config.legacy_accounts:
        proc = subprocess.run(
            [xurl, "user", account, "--limit", str(config.per_account_limit)],
            text=True,
            capture_output=True,
            timeout=45,
            check=False,
        )
        if proc.returncode != 0:
            continue
        try:
            payloads.append(json.loads(proc.stdout))
        except json.JSONDecodeError:
            continue
    return collect_posts_from_legacy_payloads(payloads, topics=config.topics)


def collect_posts(config: RadarConfig | None = None) -> list[Post]:
    config = config or RadarConfig()
    if detect_legacy_xurl():
        return collect_with_legacy_xurl(config)
    raise RuntimeError("No supported X read capability detected. Configure official X API or legacy xurl.")
