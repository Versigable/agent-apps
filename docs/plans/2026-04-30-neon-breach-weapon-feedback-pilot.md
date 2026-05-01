# Neon Breach Weapon Feedback Pilot Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Pilot the Agent Games operating model by improving weapon feedback in Neon Breach with a bounded, verifiable slice.

**Architecture:** Keep the current browser-native Three.js structure. Add small, local feedback systems around the existing fire/hit flow rather than refactoring the full game loop.

**Tech Stack:** HTML/CSS/JavaScript, Three.js, Playwright smoke tests, Agent Game Arcade preview/artifact workflow.

---

## Operating model ticket

```text
Agent: Kodor
Role: Coding specialist
Task: Improve Neon Breach weapon feedback with visible hit marker, muzzle flash, damage flash, and test hooks.
Files allowed:
- games/fps-gauntlet/index.html
- games/fps-gauntlet/styles.css
- games/fps-gauntlet/game.js
- games/fps-gauntlet/README.md
- tests/game-smoke.spec.mjs
Acceptance criteria:
- Firing produces a short visible muzzle/shot feedback effect.
- Hitting an enemy produces a short visible hit marker effect.
- Taking damage produces a short visible damage flash or HUD warning.
- DOM/debug hooks expose enough state for Playwright to verify feedback without relying only on pixels.
- Existing movement/fire/wave/HUD smoke coverage still passes.
Verification command/artifact:
- npm test
- ARTIFACT_VIDEO_MS=1000 npm run artifacts:video
- uv run pytest
- Screenshot/video artifacts inspected by Merquery/Dr/critic before commit.
Result:
- Pending
Blockers:
- None known
```

## Task 1: Add failing Playwright expectations for weapon feedback hooks

**Objective:** Define the verifiable behavior before implementation.

**Files:**
- Modify: `tests/game-smoke.spec.mjs`

**Steps:**

1. Locate the Neon Breach smoke test.
2. Add expectations that, after starting and firing with `F`, the playable root exposes feedback counters/classes such as:
   - `data-shots-fired` increases
   - `data-hit-markers` or equivalent increases when a shot hits/spawns deterministic target interaction
   - `data-muzzle-flashes` or equivalent increases after firing
3. If the current game cannot deterministically force a hit, add a test hook expectation that implementation can satisfy deterministically, e.g. a debug state value updated by the first valid hit in the smoke sequence.
4. Run:

```bash
npm test
```

Expected before implementation: FAIL because the new feedback hook(s) do not exist or do not update yet.

## Task 2: Implement muzzle and hit-marker feedback

**Objective:** Make firing and hits visibly readable while exposing deterministic debug hooks.

**Files:**
- Modify: `games/fps-gauntlet/index.html`
- Modify: `games/fps-gauntlet/styles.css`
- Modify: `games/fps-gauntlet/game.js`

**Steps:**

1. Add lightweight DOM overlays if not already present:
   - hit marker near crosshair
   - muzzle flash / weapon flash indicator
2. In the existing fire path, trigger muzzle feedback for a short duration.
3. In the existing hit/enemy-damage path, trigger hit marker feedback for a short duration.
4. Update debug attributes/counters on `#game-root` or the existing test hook root.
5. Run:

```bash
npm test
```

Expected: the new weapon feedback checks pass and existing checks remain green.

## Task 3: Implement damage feedback and document controls/feedback

**Objective:** Make player damage readable and document the feedback pass.

**Files:**
- Modify: `games/fps-gauntlet/index.html`
- Modify: `games/fps-gauntlet/styles.css`
- Modify: `games/fps-gauntlet/game.js`
- Modify: `games/fps-gauntlet/README.md`

**Steps:**

1. Add a short screen-edge flash, HUD pulse, or damage warning when player health decreases.
2. Add/update debug hook(s), for example `data-damage-flashes` or `data-last-damage-at`.
3. Update README with the new feedback behavior and any relevant test hook notes.
4. Run:

```bash
npm test
```

Expected: all Playwright checks pass.

## Task 4: Capture artifacts and critic review

**Objective:** Verify the slice through visual artifacts, not only tests.

**Files:**
- Generated ignored artifacts only under `games/artifacts/`

**Steps:**

1. Run:

```bash
ARTIFACT_VIDEO_MS=1000 npm run artifacts:video
uv run pytest
```

2. Inspect at least one screenshot artifact with vision QA:

```text
games/artifacts/test-results/smoke-screenshots/fps-gauntlet-latest.png
```

3. Ask a critic agent to review screenshot/video for:
   - whether firing feedback is visible
   - whether hit/damage feedback is understandable
   - whether HUD clarity regressed
   - scorecard deltas

Expected: visual QA finds no blocking readability regression.

## Task 5: Integrate and report

**Objective:** Commit only source/docs/test changes and report evidence.

**Files:**
- Commit source/docs/test changes only; do not commit generated artifact outputs.

**Steps:**

1. Check status:

```bash
git status --short
```

2. Commit via helper:

```bash
/home/merquery/bin/agent-apps-commit merquery "feat: polish neon breach weapon feedback" \
  docs/agent-games-operating-model.md \
  docs/plans/2026-04-30-neon-breach-weapon-feedback-pilot.md \
  games/fps-gauntlet/index.html \
  games/fps-gauntlet/styles.css \
  games/fps-gauntlet/game.js \
  games/fps-gauntlet/README.md \
  tests/game-smoke.spec.mjs
```

3. Verify remote:

```bash
git -C /home/merquery/repos/agent-apps log --format='%H | %an <%ae> | %s' -n 3
git ls-remote gitlab:agent-dev/agent-apps.git refs/heads/main
```

4. Report using the release/update template from `docs/agent-games-operating-model.md`.
