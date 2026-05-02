from datetime import datetime, timezone, timedelta

import pytest

from x_radar.models import Metrics, Post
from x_radar.rank import is_low_signal, score_post, rank_posts
from x_radar.render import render_digest
from x_radar.collect import (
    XApiError,
    build_search_query,
    collect_posts,
    collect_posts_from_legacy_payloads,
    collect_with_x_api,
    parse_x_api_search_response,
    parse_legacy_xurl_user_output,
)
from x_radar.cli import main


def test_cli_writes_digest_file_with_monkeypatched_collector(tmp_path, monkeypatch):
    now = datetime(2026, 4, 24, 20, 0, tzinfo=timezone.utc)
    sample = [Post(id="1", text="OpenClaw plus X API makes a useful viral radar for AI agents", author_username="AlexFinn", author_name="Alex Finn", created_at=now, url="https://x.com/AlexFinn/status/1", topic="X API", metrics=Metrics(likes=100))]
    monkeypatch.setattr("x_radar.cli.collect_posts", lambda config: sample)
    out = tmp_path / "digest.md"
    assert main(["--limit", "3", "--out", str(out)]) == 0
    assert "X Radar" in out.read_text()


def test_cli_rejects_invalid_max_chars():
    with pytest.raises(SystemExit):
        main(["--max-chars", "100"])


def test_build_search_query_quotes_phrases_and_excludes_retweets():
    query = build_search_query(["OpenClaw", "AI agents", "X API"])
    assert query == '(OpenClaw OR "AI agents" OR "X API") lang:en -is:retweet'


def test_build_search_query_can_focus_curated_source_accounts():
    query = build_search_query(["AI agents", "Claude Code"], source_accounts=["AlexFinn", "@steipete", "bad-handle"])
    assert query == '(from:AlexFinn OR from:steipete) ("AI agents" OR "Claude Code") lang:en -is:retweet'


def test_parse_x_api_search_response_normalizes_expanded_users():
    payload = {
        "data": [
            {
                "id": "123",
                "text": "OpenClaw and the X API make agent workflows useful",
                "created_at": "2026-04-24T17:52:19.000Z",
                "author_id": "u1",
                "public_metrics": {"reply_count": 2, "retweet_count": 3, "like_count": 10, "quote_count": 1, "bookmark_count": 4, "impression_count": 500},
            }
        ],
        "includes": {"users": [{"id": "u1", "username": "AlexFinn", "name": "Alex Finn"}]},
    }
    posts = parse_x_api_search_response(payload, topics=["OpenClaw", "local LLM", "X API"])
    assert posts == [
        Post(
            id="123",
            text="OpenClaw and the X API make agent workflows useful",
            author_username="AlexFinn",
            author_name="Alex Finn",
            created_at=datetime(2026, 4, 24, 17, 52, 19, tzinfo=timezone.utc),
            url="https://x.com/AlexFinn/status/123",
            topic="OpenClaw",
            metrics=Metrics(replies=2, reposts=3, likes=10, quotes=1, bookmarks=4, views=500),
        )
    ]


def test_collect_with_x_api_sends_bearer_auth_without_leaking_token(monkeypatch):
    seen = {}

    class FakeResponse:
        status = 200
        def read(self):
            return b'{"data":[],"includes":{"users":[]}}'

    def fake_urlopen(request, timeout):
        seen["url"] = request.full_url
        seen["auth"] = request.headers["Authorization"]
        assert timeout == 30
        return FakeResponse()

    monkeypatch.setattr("x_radar.collect.urlopen", fake_urlopen)
    posts = collect_with_x_api("secret-token", topics=["OpenClaw"], max_results=10)
    assert posts == []
    assert "Bearer secret-token" == seen["auth"]
    assert "secret-token" not in seen["url"]
    assert "tweets/search/recent" in seen["url"]


def test_collect_posts_prefers_x_api_when_env_token_exists(monkeypatch):
    sample = [Post(id="1", text="OpenClaw X API", author_username="a", author_name="A", created_at=datetime.now(timezone.utc), url="u", topic="OpenClaw", metrics=Metrics())]
    monkeypatch.setenv("X_BEARER_TOKEN", "token")
    monkeypatch.setattr("x_radar.collect.collect_with_x_api", lambda token, topics, max_results, source_accounts=(): sample)
    monkeypatch.setattr("x_radar.collect.collect_with_legacy_xurl", lambda config: [])
    assert collect_posts() == sample


def test_collect_posts_falls_back_to_legacy_when_x_api_errors(monkeypatch):
    sample = [Post(id="1", text="OpenClaw X API", author_username="a", author_name="A", created_at=datetime.now(timezone.utc), url="u", topic="OpenClaw", metrics=Metrics())]
    monkeypatch.setenv("X_BEARER_TOKEN", "token")
    monkeypatch.setattr("x_radar.collect.collect_with_x_api", lambda token, topics, max_results, source_accounts=(): (_ for _ in ()).throw(XApiError("boom")))
    monkeypatch.setattr("x_radar.collect.detect_legacy_xurl", lambda: True)
    monkeypatch.setattr("x_radar.collect.collect_with_legacy_xurl", lambda config: sample)
    assert collect_posts() == sample


def test_legacy_payload_collection_emits_each_tweet_once_with_best_topic():
    payload = {
        "tweets": [
            {"id": "1", "text": "OpenClaw and the X API make agent workflows useful", "created_at": "2026-04-24T17:52:19.000Z", "public_metrics": {"like_count": 10}},
            {"id": "2", "text": "Local LLM inference gets faster for homelab AI", "created_at": "2026-04-24T18:52:19.000Z", "public_metrics": {"like_count": 20}},
        ],
        "user": {"username": "AlexFinn", "name": "Alex Finn"},
    }
    posts = collect_posts_from_legacy_payloads([payload], topics=["OpenClaw", "local LLM", "X API"])
    assert [p.id for p in posts] == ["1", "2"]
    assert posts[0].topic in {"OpenClaw", "X API"}
    assert posts[1].topic == "local LLM"


def test_legacy_payload_collection_skips_unrelated_posts():
    payload = {
        "tweets": [{"id": "1", "text": "Vacation photos from the beach", "created_at": "2026-04-24T17:52:19.000Z", "public_metrics": {"like_count": 9999}}],
        "user": {"username": "Someone", "name": "Someone"},
    }
    assert collect_posts_from_legacy_payloads([payload], topics=["OpenClaw", "local LLM", "X API"]) == []


def test_parse_legacy_xurl_user_output_normalizes_posts():
    payload = {
        "tweets": [
            {
                "id": "123",
                "text": "OpenClaw + X API is a match made in heaven",
                "created_at": "2026-04-24T17:52:19.000Z",
                "public_metrics": {"reply_count": 2, "retweet_count": 3, "like_count": 10, "quote_count": 1, "bookmark_count": 4, "impression_count": 500},
            }
        ],
        "user": {"username": "AlexFinn", "name": "Alex Finn"},
    }
    posts = parse_legacy_xurl_user_output(payload, topic="X API")
    assert posts == [
        Post(
            id="123",
            text="OpenClaw + X API is a match made in heaven",
            author_username="AlexFinn",
            author_name="Alex Finn",
            created_at=datetime(2026, 4, 24, 17, 52, 19, tzinfo=timezone.utc),
            url="https://x.com/AlexFinn/status/123",
            topic="X API",
            metrics=Metrics(replies=2, reposts=3, likes=10, quotes=1, bookmarks=4, views=500),
        )
    ]


def test_parse_legacy_xurl_user_output_skips_malformed_tweets():
    payload = {
        "tweets": [{"id": "bad", "text": "OpenClaw bad date", "created_at": "not-a-date", "public_metrics": {"like_count": "not-int"}}],
        "user": {"username": "AlexFinn", "name": "Alex Finn"},
    }
    assert parse_legacy_xurl_user_output(payload, topic="OpenClaw") == []


def test_low_signal_filters_crypto_giveaway_noise():
    noisy = Post(id="1", text="FREE AIRDROP crypto giveaway 100x profit!!!", author_username="bot", author_name="Bot", created_at=datetime.now(timezone.utc), url="https://x.com/bot/status/1", topic="AI agents", metrics=Metrics())
    useful = Post(id="2", text="New local LLM agent benchmark compares tool-use reliability across models", author_username="researcher", author_name="Researcher", created_at=datetime.now(timezone.utc), url="https://x.com/researcher/status/2", topic="local LLM", metrics=Metrics(likes=40))
    assert is_low_signal(noisy)
    assert not is_low_signal(useful)


def test_score_post_rewards_relevance_engagement_and_recency():
    now = datetime(2026, 4, 24, 20, 0, tzinfo=timezone.utc)
    relevant = Post(id="1", text="OpenClaw agents using the X API for AI agent trend radar", author_username="a", author_name="A", created_at=now - timedelta(hours=1), url="u", topic="X API", metrics=Metrics(replies=5, reposts=10, likes=100, quotes=2, bookmarks=20, views=5000))
    stale = Post(id="2", text="random old post", author_username="b", author_name="B", created_at=now - timedelta(days=5), url="u", topic="X API", metrics=Metrics(likes=1))
    assert score_post(relevant, now=now) > score_post(stale, now=now)


def test_rank_posts_deduplicates_filters_and_limits():
    now = datetime(2026, 4, 24, 20, 0, tzinfo=timezone.utc)
    good = Post(id="1", text="AI agents and OpenClaw trend radar", author_username="a", author_name="A", created_at=now, url="u", topic="AI agents", metrics=Metrics(likes=50))
    duplicate = Post(id="1", text="AI agents and OpenClaw trend radar", author_username="a", author_name="A", created_at=now, url="u", topic="AI agents", metrics=Metrics(likes=50))
    noisy = Post(id="2", text="crypto airdrop giveaway", author_username="bot", author_name="Bot", created_at=now, url="u", topic="AI agents", metrics=Metrics(likes=999))
    assert rank_posts([noisy, duplicate, good], limit=5, now=now) == [good]


def test_render_digest_includes_required_fields_and_length_guard():
    now = datetime(2026, 4, 24, 20, 0, tzinfo=timezone.utc)
    posts = [Post(id="1", text="OpenClaw plus X API makes a useful viral radar for AI agents", author_username="AlexFinn", author_name="Alex Finn", created_at=now, url="https://x.com/AlexFinn/status/1", topic="X API", metrics=Metrics(replies=5, reposts=10, likes=100, quotes=2, bookmarks=20, views=5000))]
    digest = render_digest(posts, generated_at=now, max_chars=1200)
    assert "X Radar" in digest
    assert "@AlexFinn" in digest
    assert "https://x.com/AlexFinn/status/1" in digest
    assert "Why it matters" in digest
    assert "Suggested angle" in digest
    assert len(digest) <= 1200
