# RIFT//RUNNER — Vector Overdrive

## Requested direction
Eric wants mechanics, progression, upgrades and visual intensity closer to Geometry Wars. Preserve an original identity, with Geometry Wars-inspired continuous arcade risk/reward rather than copied assets or a claim of identical rules.

## Design
- Replace wave-clear upgrade pauses with continuous timed spawning and escalating threat.
- Kills drop collectible geoms. Collecting them raises the score multiplier and unlocks wider weapon patterns during play.
- Three lives and three limited nova bombs; dying resets multiplier and grants respawn protection. Bombs clear threats without farming points/drops.
- Distinct pursuing, evasive, splitting and gravity-well enemies; telegraph spawns.
- Retain damaging dash/afterimage, pause, mute, keyboard autoaim fallback and touch controls.
- Local personal-best persistence.
- Pure renderer separate from simulation: warped vector grid, color-coded silhouettes, hot-core projectiles, additive sparks, implosion/bomb rings, redesigned title and compact arcade HUD.

## File ownership
- Mechanics builder: game.js and tests/rift-runner.spec.mjs, test-first vertical implementation. Deadline-bounded; parent completes any unfinished work.
- Merquery: renderer.js, index.html, styles.css, renderer/arcade tests, metadata/docs, independent QA and release.

## Done evidence
- New deterministic mechanics tests plus actual-input browser play.
- Renderer purity and pixel-output test; inspect desktop and phone screenshots.
- Full browser normal + CI-style suite with KANBAN_MODE=fixture; Python suite.
- Real gameplay video, reachable existing preview, explicit-file commit and remote verification.

## Known tradeoffs
One endless mode, original enemy/rule adaptations. No claim of a feature-for-feature Geometry Wars clone. Keyboard/mouse prioritized; touch emulation checked, physical phones not benchmarked.
