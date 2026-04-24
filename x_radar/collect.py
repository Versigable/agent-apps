from __future__ import annotations

import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .config import RadarConfig
from .models import Metrics, Post


class XApiError(RuntimeError):
    """Raised when official X API collection fails safely."""


X_SEARCH_URL = "https://api.x.com/2/tweets/search/recent"


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


def _metrics_from_public_metrics(metrics_raw: dict[str, Any]) -> Metrics:
    return Metrics(
        replies=_safe_int(metrics_raw.get("reply_count")),
        reposts=_safe_int(metrics_raw.get("retweet_count")),
        likes=_safe_int(metrics_raw.get("like_count")),
        quotes=_safe_int(metrics_raw.get("quote_count")),
        bookmarks=_safe_int(metrics_raw.get("bookmark_count")),
        views=_safe_int(metrics_raw.get("impression_count")),
    )


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
        metrics = _metrics_from_public_metrics(metrics_raw)
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


def build_search_query(topics: Iterable[str]) -> str:
    clauses: list[str] = []
    for topic in topics:
        topic = topic.strip()
        if not topic:
            continue
        if any(ch.isspace() for ch in topic):
            escaped = topic.replace('"', '\\"')
            clauses.append(f'"{escaped}"')
        else:
            clauses.append(topic)
    if not clauses:
        raise ValueError("at least one X Radar topic is required")
    return f"({' OR '.join(clauses)}) lang:en -is:retweet"


def parse_x_api_search_response(payload: dict[str, Any], topics: Iterable[str]) -> list[Post]:
    users = {
        str(user.get("id")): user
        for user in (payload.get("includes") or {}).get("users") or []
        if user.get("id")
    }
    posts: list[Post] = []
    topic_list = list(topics)
    for tweet in payload.get("data") or []:
        tweet_id = str(tweet.get("id") or "")
        text = str(tweet.get("text") or "").strip()
        created_raw = tweet.get("created_at")
        if not tweet_id or not text or not created_raw:
            continue
        topic = _best_topic_for_text(text, topic_list)
        if topic is None:
            continue
        try:
            created_at = _parse_x_time(str(created_raw))
        except (TypeError, ValueError):
            continue
        user = users.get(str(tweet.get("author_id") or ""), {})
        username = str(user.get("username") or tweet.get("author_id") or "unknown")
        name = str(user.get("name") or username)
        posts.append(
            Post(
                id=tweet_id,
                text=text,
                author_username=username,
                author_name=name,
                created_at=created_at,
                url=f"https://x.com/{username}/status/{tweet_id}",
                topic=topic,
                metrics=_metrics_from_public_metrics(tweet.get("public_metrics") or {}),
            )
        )
    return posts


def collect_with_x_api(bearer_token: str, topics: Iterable[str], max_results: int = 25) -> list[Post]:
    token = bearer_token.strip()
    if not token:
        raise XApiError("X_BEARER_TOKEN is empty")
    bounded_max = max(10, min(max_results, 100))
    params = {
        "query": build_search_query(topics),
        "max_results": str(bounded_max),
        "sort_order": "recency",
        "tweet.fields": "created_at,public_metrics,author_id,lang,conversation_id",
        "expansions": "author_id",
        "user.fields": "username,name,verified,public_metrics",
    }
    url = f"{X_SEARCH_URL}?{urlencode(params)}"
    request = Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": "x-radar-merquery/0.1"})
    try:
        response = urlopen(request, timeout=30)
        payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        raise XApiError(f"X API HTTP {exc.code}") from exc
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise XApiError(f"X API request failed: {exc.__class__.__name__}") from exc
    return parse_x_api_search_response(payload, topics=topics)


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
    bearer_token = os.environ.get("X_BEARER_TOKEN", "").strip()
    if bearer_token:
        try:
            return collect_with_x_api(bearer_token, topics=config.topics, max_results=max(10, config.per_account_limit * len(config.legacy_accounts)))
        except XApiError:
            if not detect_legacy_xurl():
                raise
    if detect_legacy_xurl():
        return collect_with_legacy_xurl(config)
    raise RuntimeError("No supported X read capability detected. Configure X_BEARER_TOKEN or legacy xurl.")
