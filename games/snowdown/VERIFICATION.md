# Snowdown — polish release verification (historical)

This records the earlier item-1 release, commit `076cc80`. For the charged-snowball and mini-boss release, see [MOONWALK-VERIFICATION.md](MOONWALK-VERIFICATION.md).

## Shipped scope

Item 1 only: renderer optimization, screen-relative controls, real throw windup and release, impact/recoil/dodge feedback, P1/P2 markers and cooldown HUD, controller Start pause/resume, and bounded fixed-substep simulation. No new charge mechanic, boss, map or online mode.

## Executed checks

- `KANBAN_MODE=fixture npm test`: **52 passed**.
- `KANBAN_MODE=fixture CI=true npm run test:ci`: **52 passed**.
- `uv run pytest`: **29 passed**.
- Independent implementation review: **SPEC PASS / QUALITY APPROVED**.
- Added a real production-rAF browser regression for controller Start pause, held-button stability, release/repress resume and continued simulation. Does not enable test mode or mutate simulation.
- Local game/assets served successfully; private `.git/config` returned 403. Public preview retains existing sign-in redirect; no access-control change.

## Performance evidence and limits

Latest normal suite: **14.80 rendered FPS**, 6.0583 simulated seconds during a 6.0132-second wall-time sample. CI-equivalent: **15.25 rendered FPS**, 6.0917 simulation seconds in 6.0347 wall seconds. Slight sampling-boundary differences are expected. These are software-WebGL results, not a hardware benchmark or a claim of smooth 60 FPS.

Static mesh batching, baked stationary shadows, Lambert lighting and adaptive drawing-buffer resolution reduce rendering cost. Fixed 1/120-second simulation substeps remove ordinary slow-frame slow motion while retaining a 0.25-second cap on accepted long gaps. Pausing clears accumulated time. At slow-device resolution floor, 3D scenery is softened but DOM labels remain native resolution. Physical hardware performance remains unmeasured.

## Media evidence

- `games/artifacts/videos/snowdown-polish.mp4`: decoded and probed H.264, 1280×720, exactly 10 seconds; silent screen recording.
- `games/artifacts/test-results/smoke-screenshots/snowdown-latest.png`: visually inspected.
- `games/artifacts/videos/snowdown-polish-contact.png`: opening/middle/ending decoded frames visually inspected.
- Real keyboard capture (no invulnerability or forced progression): **22 throws each**, **4 / 3 dodges**, **24 hits**, score **1200**, with both players visibly moving. Nearest-enemy assisted aiming is part of normal gameplay.
- Generated media/test artifacts remain ignored rather than committed.

## Provisional agent self-score (not human playtest ratings)

- Gameplay: **7/10** — complete cooperative loop; very short demo and difficulty still needs friends' feedback.
- Controls: **8/10** — independent keyboard/controllers, screen-relative movement and pause regression; no remapping yet.
- Visual clarity: **8/10** — clear color coding, markers and HUD; couch-distance readability needs a real display check.
- Performance: **6/10** — much lower render cost and near-real-time simulation; software rendering still visibly limited.
- Replayability: **5/10** — one compact town and three waves, no additional modes.
- Agent self-test quality: **9/10** — full regression, independent review, production-rAF test and real-input media; cannot replace human hardware testing.

## Remaining acceptance item

**Actual two-human couch/physical-controller playtest is pending.** Use `docs/plans/snowdown-couch-playtest.md`. Test keyboard rollover, controller recognition, difficulty, readability and feel on the friends' real setup. Do not describe automated controller emulation as physical testing.
