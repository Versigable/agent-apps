# RIFT//RUNNER demo

## Goal
Ship a browser-native neon arena shooter with a damaging dash/afterimage identity, escalating combat, upgrade choices, boss climax, and replay loop. No CDN or asset dependency.

## Ownership
- Builder subagent: games/rift-runner and focused Playwright suite, test-first implementation.
- Merquery: arcade integration, independent acceptance/visual review, full regression checks, gameplay artifacts, explicit-file commit/push and live preview verification.

## Acceptance
- Start, movement, firing, dash, pause, combat scoring, upgrades, boss and restart work.
- Clear readable desktop HUD and responsive layout; document input support honestly.
- Durable state counters and deterministic hooks exercise transitions without timing flakes.
- Register manifest with model attribution gpt-6 Astra and preview/artifact links.
- Full npm test, CI-style browser test and Python regression pass.
- Inspect real screenshot; capture actual gameplay video; verify live game route/assets.
- Commit only owned files; verify remote commit.

## Baseline
2026-09-06: 23 Playwright tests and 29 Python tests pass. Public arcade responds with authentication redirect (302); use existing internal preview for runtime verification and public link for authenticated user.
