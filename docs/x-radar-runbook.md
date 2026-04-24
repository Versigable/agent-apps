# X Radar Runbook

Generate a read-only digest locally:

```bash
python3 scripts/run_x_radar.py --limit 5 --out /tmp/x-radar-digest.md
```

Current implementation supports the local legacy `xurl user USERNAME --limit N` reader as a bootstrap data source. Full X search API support should be added when official API credentials/tooling are configured safely.

Secrets must not be stored in this repo, the Obsidian vault, Discord, or logs.
