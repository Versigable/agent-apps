# X Radar Runbook

Generate a read-only digest locally:

```bash
python3 scripts/run_x_radar.py --limit 5 --out /tmp/x-radar-digest.md
```

## Official X API search

X Radar prefers direct official X API recent search when `X_BEARER_TOKEN` is present in the process environment. It calls:

```text
GET https://api.x.com/2/tweets/search/recent
```

with read-only bearer auth, `tweet.fields=created_at,public_metrics,author_id,lang,conversation_id`, and `expansions=author_id`.

The default query is intentionally curated: it focuses on Alex Finn, Peter Steinberger (`@steipete`), and a small adjacent orbit of high-signal AI-engineering and Apple/indie-app accounts configured in `x_radar/config.py`. The official API query combines `from:` account filters with topical terms so the radar behaves more like a curated source watchlist than random broad keyword scraping.

Store the token outside the repo/vault/Discord. Recommended local env file:

```bash
mkdir -p ~/.config/x-radar
chmod 700 ~/.config/x-radar
printf 'X_BEARER_TOKEN=PASTE_TOKEN_HERE\n' > ~/.config/x-radar/env
chmod 600 ~/.config/x-radar/env
```

Run with the token loaded:

```bash
set -a
. ~/.config/x-radar/env
set +a
python3 scripts/run_x_radar.py --limit 5 --max-chars 5000
```

## Fallback

If `X_BEARER_TOKEN` is absent or official X API search fails and legacy `xurl` is available, X Radar falls back to the local legacy read-only `xurl user USERNAME --limit N` reader.

Current fallback accounts are the same curated source list configured in `x_radar/config.py`.

Secrets must not be stored in this repo, the Obsidian vault, Discord, or logs.
