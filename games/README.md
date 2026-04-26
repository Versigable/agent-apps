# Agent Games Workspace

This workspace holds browser-playable games and testing infrastructure for agent-built app workflows.

## Layout

```text
games/
  manifest.json              # Registry for arcade cards and metadata
  arcade/                    # Agent Game Arcade dashboard
  fps-gauntlet/              # Neon Breach FPS prototype
  artifacts/                 # Smoke-test screenshots/videos/reports
```

## Run locally

From the repository root:

```bash
npm install
npm run serve:games
```

Open the arcade:

```text
http://127.0.0.1:4173/games/arcade/
```

## Automated tests

```bash
npm test
```

The Playwright smoke tests verify:

- the arcade loads `games/manifest.json`
- game cards render with play links and scorecard metadata
- Neon Breach loads without console errors
- the game can start, accept movement/fire input, spawn enemies, and update HUD state
- screenshots are captured to ignored paths in `games/artifacts/test-results/`


## One-click homelab preview

Run the internal preview service from the repo root:

```bash
npm run serve:preview
```

Open the arcade from inside the homelab/Tailscale network:

```text
http://100.104.27.125:4173/games/arcade/
```

The arcade renders a one-click internal preview link for each game that has `previewUrl` metadata in `games/manifest.json`. The service also exposes:

- `GET /healthz` for health checks
- `GET /__preview/manifest` for resolved preview metadata

Install the persistent user service with:

```bash
scripts/install-preview-service.sh
```

## Video artifacts

Capture a fresh automated gameplay artifact:

```bash
npm run artifacts:video
```

Outputs are intentionally ignored by Git:

- `games/artifacts/videos/fps-gauntlet-latest.webm`
- `games/artifacts/test-results/smoke-screenshots/fps-gauntlet-latest.png`
- `games/artifacts/latest-run.json`

## Registering future games

1. Add the game under `games/<kebab-case-id>/`.
2. Include an `index.html` that can run from the static server.
3. Add/update Playwright coverage in `tests/game-smoke.spec.mjs`.
4. Add a manifest entry to `games/manifest.json`:

```json
{
  "id": "example-game",
  "title": "Example Game",
  "type": "arena",
  "status": "prototype",
  "playUrl": "./example-game/",
  "testCommand": "npm test",
  "manualChecklist": ["Start it", "Move", "Interact", "Lose/restart"]
}
```

## Manual scorecard

Use 0–10 for each category:

| Category | Question |
| --- | --- |
| Gameplay | Is the loop fun and understandable? |
| Controls | Are inputs responsive and correctly mapped? |
| Visual clarity | Can you tell what is happening? |
| Performance | Does it feel smooth in browser? |
| Replayability | Is there a reason to try again? |
| Agent self-test quality | Did the agent provide real test proof/artifacts? |

## Near-term roadmap

- Keep the internal preview service running via the tracked user systemd unit.
- Promote selected previews to GitLab Pages if public sharing becomes useful.
- Per-commit arcade metadata: commit hash, agent, model, pass/fail, screenshot.
- Comparative benchmark prompts inspired by Alex Finn's FPS/city/music visualizer gauntlets.
