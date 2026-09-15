# agent-apps

**Applications written by AI agents, merged only against evidence.**

This is a working monorepo, not a demo. Agents implement features on branches; every change
lands through a merge request that a human reviews against execution artifacts — pytest runs,
Playwright browser smoke tests, screenshots, and recorded gameplay video — rather than against
the agent's own claim that it worked.

## How a change lands

1. **Scope is written down first.** Work is specified as a plan before an agent starts, so
   "done" is defined up front rather than negotiated afterwards (`docs/plans/`).
2. **An agent implements on a branch** and opens a merge request.
3. **Verification produces artifacts, not assertions.** `npm test` drives Playwright smoke
   tests against a real browser, `npm run artifacts:video` records gameplay proof, and
   `uv run pytest` covers the Python utilities.
4. **CI re-runs the same suites** on every push (`.gitlab-ci.yml`), publishing
   `playwright-report/` and `test-results/` as build artifacts.
5. **A human reviews the diff and the evidence before merge.**
6. **A persistent internal preview service** hosts the result so it can be exercised by hand
   before it counts as finished.

## Why it is built this way

Agent-written code is cheap to produce and expensive to trust. The workflow above exists so
that trust comes from reproducible evidence — a test run, a screenshot, a recording — instead
of from a summary the agent wrote about its own work. The interesting engineering here is the
verification surface, not the apps themselves.

## Current projects

### Hermes Kanban operator app

Operator web board for local Hermes Kanban lives under [`apps/kanban/`](./apps/kanban/) and is served by the preview service at `/apps/kanban/`. Current app-preview exposes constrained card/board operations plus high-friction manual dispatch/claim controls while still avoiding automatic ready promotion.

Operator apps should be exposed through the app preview surface, not the game preview surface. The persistent app-preview service listens on port `4175` and is intended for `https://app-preview.ninjaprivacy.org/apps/` once Traefik routes that hostname to OpenClaw port `4175`. The app dashboard mirrors the game arcade launcher at [`apps/`](./apps/) with its own operator-control flair and links to `/apps/kanban/`.

#### Playtest capture

In **Game Dev**, expand **Playtest → task capture** to open the selected playable build in a new tab and record notes. Submit creates an **unassigned triage task**, never a dispatch. Build identifiers are explicitly unknown when left blank; a mutable preview URL is not commit or test evidence.

Drafts and errors stay in this tab, separately per board/game. An unchanged retry reuses its idempotency key; changed observations get a fresh key. Navigating board/game A → B → A cannot let an older POST or screenshot decode overwrite the current draft.

Optional PNG/JPEG/WebP input is limited to 8 MiB and 4096 × 4096 pixels. The browser rasterizes, strips ancillary metadata and repeatedly resizes to a PNG no larger than 1024 × 1024 and 64 KiB, or displays a bounded error. Remove screenshot clears an invalid attachment. The bridge independently validates PNG structure, checksums, decompression limits and the complete stored body's **100,000-byte UTF-8 ceiling**. Evidence is embedded in private task metadata, not exposed by a general file-serving endpoint; raw metadata/base64 is omitted from the human task body display.

Capture and Kanban regression suite (isolated fixture preview):

```bash
KANBAN_MODE=fixture PLAYWRIGHT_PREVIEW_PORT=4361 npx playwright test tests/playtest-capture*.spec.mjs tests/kanban*.spec.mjs --workers=1 --output=/tmp/playtest-finish --reporter=list
```

#### Build evidence

Task drawers include an **Evidence** tab with the captured screenshot/build target and recorded scoped checks. **Add evidence** is an intentional, write-enabled game-task form; it records reports, never runs checks or dispatches workers. Build and commit are optional and default to unknown rather than inheriting a presumed tested identity. HTTP(S) screenshot/video/play links are references, not immutable deployment proof.

Reports are labeled **operator-reported**. An exact known identifier match means a reported pass against the task's captured build; different identifiers show older/other-build evidence, unknown identifiers show unverified association, and failed/error/skipped outcomes remain explicit. No records means **Not tested**. Neither matching reports nor catalog checklists establish independent CI verification or live deployed identity.

Writes use one UUID per unchanged draft; changing the payload generates a new ID. Failed requests preserve the draft, successful writes require task-detail GET readback before rendering persisted evidence, and stale board/drawer/edit responses cannot overwrite the current UI. The existing task comment backend remains authoritative; there is no second task store.

```bash
KANBAN_MODE=fixture PLAYWRIGHT_PREVIEW_PORT=4369 npx playwright test tests/kanban-evidence.spec.mjs --workers=1 --output=/tmp/evidence-frontend --reporter=list
```

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
http://<preview-host>:4173/games/arcade/
```

App preview dashboard URL after Traefik targets OpenClaw port `4175`:

```text
https://app-preview.ninjaprivacy.org/apps/
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

The app preview user unit lives at `deploy/systemd/user/agent-app-preview.service` and listens on port `4175` with `PREVIEW_SURFACE=apps`, `KANBAN_READONLY=false`, `KANBAN_WRITE_AUTHOR=app-preview`, and `KANBAN_EXECUTION_ENABLED=true`. This keeps app previews independently targetable from game previews on port `4173` with `PREVIEW_SURFACE=games`. The Kanban app can create/manage cards and expose high-friction manual dispatch/claim controls, but it still does not expose automatic ready promotion or board-groomer automation.

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
