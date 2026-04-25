# Agent Game Arcade + FPS Gauntlet Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Create a browser-playable first-person shooter prototype plus an Agent Game Arcade dashboard and repeatable browser smoke-test workflow.

**Architecture:** Keep this as a static web workspace under `games/` so Eric can test from any simple web server. `games/arcade/` is the launcher/dashboard, `games/fps-gauntlet/` is the first playable game, and `games/manifest.json` is the source of truth for registered agent-made games. Playwright tests validate both the arcade and the FPS by opening pages, checking console errors, exercising controls, and capturing screenshots.

**Tech Stack:** Static HTML/CSS/JavaScript, Three.js from CDN for the FPS, Node/npm for local test tooling, Playwright for browser smoke tests.

---

## Task 1: Add game workspace test scaffold

**Objective:** Create npm scripts and Playwright configuration for static game smoke testing.

**Files:**
- Create: `package.json`
- Create: `playwright.config.mjs`
- Create: `tests/game-smoke.spec.mjs`

**TDD cycle:**
1. Write a Playwright test expecting `games/manifest.json`, arcade UI, and FPS UI to exist.
2. Run `npm test` and verify it fails because files are not implemented yet.
3. Add minimal static pages/manifest in later tasks.
4. Re-run `npm test` and verify green.

## Task 2: Add Agent Game Arcade manifest and dashboard

**Objective:** Implement a static dashboard that lists agent-made games and exposes play/test metadata.

**Files:**
- Create: `games/manifest.json`
- Create: `games/arcade/index.html`
- Create: `games/arcade/styles.css`
- Create: `games/arcade/app.js`

**Requirements:**
- Dashboard title: `Agent Game Arcade`.
- Load `../manifest.json` dynamically.
- Render at least one card for `fps-gauntlet`.
- Include score/rating slots, play link, test command, and manual checklist.
- Fail gracefully if manifest loading fails.

## Task 3: Add FPS Gauntlet prototype

**Objective:** Implement `Neon Breach`, a browser-playable Three.js FPS arena prototype.

**Files:**
- Create: `games/fps-gauntlet/index.html`
- Create: `games/fps-gauntlet/styles.css`
- Create: `games/fps-gauntlet/game.js`
- Create: `games/fps-gauntlet/README.md`

**Requirements:**
- WASD movement, mouse-look/pointer-lock support, click-to-fire.
- Keyboard fallback fire with `F` for automated tests/headless use.
- Enemy drones, score, wave, health, heat/ammo-like UI.
- Start/restart loop.
- Deterministic enough smoke-test hooks via DOM state attributes.
- No backend required.

## Task 4: Add artifacts and testing docs

**Objective:** Document how Eric and agents test future games.

**Files:**
- Create: `games/README.md`
- Create: `games/artifacts/.gitkeep`
- Modify: `README.md`

**Requirements:**
- Explain local commands.
- Explain Playwright screenshot/video artifact paths.
- Add manual game scorecard rubric.
- Describe how future games register in `games/manifest.json`.

## Task 5: Verify and commit

**Objective:** Prove the game and arcade work and push to GitLab.

**Commands:**
- `npm install`
- `npx playwright install chromium` if needed
- `npm test`
- `npm run test:ci` in fresh/CI environments where Playwright browsers may not be installed
- `npm run test:headed` only if debugging locally
- `/home/merquery/bin/agent-apps-commit merquery "feat: add agent game arcade and fps gauntlet" <files>`

**Verification:**
- Playwright tests pass.
- Screenshot artifacts are created under `games/artifacts/`.
- GitLab remote main reflects the pushed commit.
