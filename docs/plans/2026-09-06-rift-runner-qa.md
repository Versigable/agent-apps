# RIFT//RUNNER independent QA

## Observed browser play
- Real WASD movement, held F firing, Space dash and UI upgrade clicks cleared two waves and reached the Gatekeeper without test-state manipulation.
- Browser run reported zero page errors, wave 3, score 1600, kills 16.
- Desktop title, upgrade menu and boss arena screenshots visually inspected at 1440x900. HUD readable, controls and menu choices not clipped.
- Phone title/touch-control layout visually inspected at 390x844; document width equals viewport width.
- Initial-wave headless Chromium animation sample: 179 frame intervals, median 16.7ms, p95 16.8ms. This is a local smoke measurement, not a device-wide performance benchmark.

## Review findings
- Found mouse coordinate mapping risk from object-fit letterboxing; sent to builder for correction and regression test.
- Requested actual lingering afterimage damage to match the advertised mechanic, with bounded per-enemy damage and a regression test.

## Delivery
- Public URL: https://game-preview.ninjaprivacy.org/games/rift-runner/
- Existing public Authentik gate responds with HTTP 302; no login bypass attempted.
- Existing internal preview health is good; /.git/config returns HTTP 403.
- Final full-suite checks: 31 Playwright tests pass under both npm test and CI=true npm run test:ci with KANBAN_MODE=fixture explicitly set; 29 Python tests pass under uv run pytest.
- An earlier unpinned full run hit four unrelated Kanban fixture/live-mode mismatches. Explicit fixture mode resolved these without changing Kanban code or state.
- Final standard video capture reports zero console errors; independent real-input showcase reaches wave 3 and is encoded as an 11.24-second MP4.
- Mouse mapping and bounded afterimage damage regression tests pass.
- Separate reviewer subagent could not start due an expired provider token; the orchestrator performed independent code/input/visual review instead. The builder reached its delegation time limit after seven focused tests passed; the orchestrator completed documentation, artifact integration and final delivery.

## Provisional agent self-rating (not user ratings)
- Gameplay: 8/10 — responsive short waves, permanent upgrades, recurring boss; limited arena variety.
- Controls: 8/10 — keyboard/mouse plus on-screen touch controls; no gamepad verification.
- Visual clarity: 8/10 — distinct neon silhouettes and readable HUD; deliberately minimal arena.
- Performance: 9/10 — smooth local Chromium sample; low-end/mobile GPU not benchmarked.
- Replayability: 7/10 — scaling waves and build choices, one arena.
- Agent self-test quality: 8/10 — real-input play plus deterministic state coverage; physical device testing outstanding.
