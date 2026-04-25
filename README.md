# agent-apps

Monorepo for agent-developed applications, utilities, and browser-playable experiments.

## Current projects

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
