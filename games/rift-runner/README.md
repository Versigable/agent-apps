# RIFT//RUNNER

A dependency-free Canvas2D arena shooter built by Merquery with a gpt-6 Astra implementation subagent and orchestrator gameplay/visual QA.

Play: https://game-preview.ninjaprivacy.org/games/rift-runner/ (existing homelab sign-in applies).

## Play
- WASD / arrows: move.
- Mouse: aim; hold primary button to fire.
- Hold F: fire with nearest-enemy auto-aim.
- Space: phase dash. Contact and lingering afterimage damage each enemy at most once per dash; use it offensively or to evade.
- P: pause/resume. M: toggle synthesized sound effects.
- Touch devices: on-screen direction, fire and dash buttons.

Clear hostiles, pick a permanent augmentation, repeat. Every third wave brings the Gatekeeper's radial projectiles. Wave clear repairs 20 hull. Death resets the run. This is an endless score chase, not a campaign with a final victory screen.

## Implementation and verification
No network assets, libraries, installs or build step required for the game itself. Serve through the existing preview service.

```sh
KANBAN_MODE=fixture npm test
CI=true KANBAN_MODE=fixture npm run test:ci
uv run pytest
ARTIFACT_VIDEO_MS=10000 npm run artifacts:video -- rift-runner
```

Focused suite: `npx playwright test tests/rift-runner.spec.mjs tests/rift-arcade.spec.mjs`.

`window.__gameTest` exposes snapshot, setupCombat, clearWave, setupBossShot, setupLethalCollision and probeAfterimage for deterministic smoke tests. The game root exposes state, wave, health, shots, kills, dash and trail counters. Test hooks are local single-player diagnostics, not competitive anti-cheat boundaries.

Known limits: one arena, recurring boss pattern, no saved leaderboard or gamepad support; touch layout and events checked in Chromium emulation, not a physical phone. Sound events tested programmatically; no subjective listening assessment.

See `docs/plans/2026-09-06-rift-runner-qa.md` for independent gameplay observations, self-ratings and verification details.
