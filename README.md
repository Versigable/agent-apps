# agent-apps

Monorepo for agent-developed applications, utilities, and browser-playable experiments.

## Current projects

### Hermes Kanban operator app

Read-safe web board for local Hermes Kanban lives under [`apps/kanban/`](./apps/kanban/) and is served by the preview service at `/apps/kanban/`. The first milestone intentionally locks dispatcher and `ready` promotion controls until the operator workflow is approved.

Operator apps should be exposed through the app preview surface, not the game preview surface. The persistent app-preview service listens on port `4175` and is intended for `https://app-preview.ninjaprivacy.org/apps/kanban/` once Traefik routes that hostname to OpenClaw port `4175`.

### X Radar

Read-only X/Twitter trend radar utilities used by the scheduled Discord digest workflow.

### Agent Games Workspace

Browser game prototypes and test infrastructure live under [`games/`](./games/):

- [`games/arcade/`](./games/arcade/) — Agent Game Arcade dashboard and launcher.
- [`games/fps-gauntlet/`](./games/fps-gauntlet/) — **Neon Breach**, a Three.js FPS prototype.
- [`games/manifest.json`](./games/manifest.json) — registry for playable games, scorecards, and test metadata.

## Game testing quickstart

```bash
npm install
npm run serve:games
```

Open the arcade at:

```text
http://127.0.0.1:4173/games/arcade/
```

Run browser smoke tests locally:

```bash
npm test
```

Run browser smoke tests in a fresh/CI-like environment where Playwright browsers may not exist yet:

```bash
npm run test:ci
```

Generated Playwright artifacts are written under ignored paths in `games/artifacts/test-results/` and `games/artifacts/playwright-report/`.


## One-click internal preview

The Agent Game Arcade can run as a homelab/Tailscale preview service on OpenClaw:

```bash
npm run serve:preview
# health check
npm run preview:health
```

Internal preview URL:

```text
http://100.104.27.125:4173/games/arcade/
```

For boot-persistent hosting as the `merquery` user:

```bash
scripts/install-preview-service.sh
```

The tracked user unit lives at `deploy/systemd/user/agent-apps-preview.service`.

For boot-persistent operator app hosting as the `merquery` user:

```bash
scripts/install-app-preview-service.sh
```

The app preview user unit lives at `deploy/systemd/user/agent-app-preview.service` and listens on port `4175` with `PREVIEW_SURFACE=apps`. This keeps app previews independently targetable from game previews on port `4173` with `PREVIEW_SURFACE=games`.

## Video artifact workflow

Capture a 10-second automated gameplay proof for Neon Breach:

```bash
npm run artifacts:video
```

The workflow starts/uses the preview service, records browser gameplay, and writes ignored artifacts under:

- `games/artifacts/videos/fps-gauntlet-latest.webm`
- `games/artifacts/test-results/smoke-screenshots/fps-gauntlet-latest.png`
- `games/artifacts/latest-run.json`

## Python utility tests

```bash
uv run pytest
```

## Agent game workflow

1. Build or update a game under `games/<game-id>/`.
2. Register it in `games/manifest.json`.
3. Add/extend Playwright smoke tests in `tests/game-smoke.spec.mjs`.
4. Run `npm test` and capture screenshots/video artifacts.
5. Commit with test results and report the manual scorecard for Eric.
