# RIFT//RUNNER — Vector Overdrive

A Geometry Wars-inspired continuous vector-arena score chase. Original code and visual assets; not a feature-for-feature clone.

Play: https://game-preview.ninjaprivacy.org/games/rift-runner/ (existing homelab sign-in).

## Controls
- **WASD / arrows:** move independently of aim.
- **Mouse + held primary button:** aim and fire.
- **Hold F:** nearest-enemy auto-aim/fire, also used by touch FIRE.
- **Space:** phase dash and damaging afterimage; one hit per enemy per dash.
- **B:** nova bomb. Three charges per run; clears hostiles/projectiles but awards no kills, score or geom drops.
- **P / M:** pause/resume and mute. Losing browser focus pauses play.
- Touch direction/fire/dash/bomb buttons on coarse-pointer devices.

## Evolved arcade rules
There are no wave-clear menus or between-wave teleports. A continuous director introduces telegraphed enemy packs and raises threat every 15 seconds. The opening is gentle; subsequent tiers increase pack size and arrival frequency. Population caps prevent runaway spawning.

Kills drop green **geoms**. Move close to magnetize and collect them before they disappear. Every collected geom raises the current multiplier by one; kills award their base score times that multiplier. Chasing drops creates risk instead of letting the player sit safely in a corner.

The weapon evolves automatically at **10 / 30 / 60 total collected geoms**, reaching tiers 2 / 3 / 4 with broader projectile patterns. These are run upgrades, not permanent account progression. Life loss resets the score multiplier but retains the run's weapon evolution.

Start with **three lives**. Contact costs a life, clears nearby danger and grants respawn protection. Zero lives ends the run. Local personal best survives browser reloads (storage failures are tolerated).

Enemy vocabulary:
- **Blue seekers:** direct pursuit.
- **Green weavers:** evade incoming fire laterally.
- **Pink splitters:** release three fast fragments on death.
- **Orange singularities:** pull the ship and bend nearby shots; destruction triggers a local chain explosion.

## Adaptive audio
`audio.js` synthesizes an original 132 BPM electro/breakbeat score with an A-minor-key chord progression. Bass and a sparse beat establish the groove; threat 2 adds percussion, threat 4 adds arpeggios, and weapon tier 3 adds a lead. Changes land on bar boundaries. A lost life strips the arrangement for two bars before rebuilding.

Distinct effects cover evolving weapons, chord-matched geom chimes, stereo dash, splitter fracture, kills, upgrades, life loss, death and nova suction/impact. The nearest gravity well has a distance-sensitive stereo hum. Major impacts briefly duck the music.

Open **AUDIO MIXER** below the arena for independent music/effects levels. Levels and M mute persist locally. Sound starts on the Start gesture; pause, hidden tabs and lost focus suspend audio. Sliders do not steer the ship. A 48-source budget, routine-event throttles, priority reservation, compression and conservative gain keep swarms bounded. No external music service or assets.

`window.riftAudio.snapshot()` exposes actual context, scheduling, voice and signal-energy diagnostics. `captureStream()` returns the real post-master stereo mix for a MediaRecorder, not synthetic test audio. Browser-only automated verification is not a physical-device listening review.

## Visual architecture
`game.js` owns gameplay, state and effect lifetimes. `renderer.js` is a pure scene consumer: elastic vector lattice, geometric silhouettes, ship afterimages, hot-core tracer fire, sparks, expanding shock rings and an animated title sculpture. One quarter-resolution bloom pass avoids expensive per-particle shadow blurs.

No CDN, external art assets or game build step. Existing repository preview service serves the files.

## Verification
```sh
KANBAN_MODE=fixture npm test
CI=true KANBAN_MODE=fixture npm run test:ci
uv run pytest
ARTIFACT_VIDEO_MS=10000 npm run artifacts:video -- rift-runner
```

Focused tests: `KANBAN_MODE=fixture npx playwright test tests/rift-runner.spec.mjs tests/rift-renderer.spec.mjs tests/rift-arcade.spec.mjs tests/rift-audio.spec.mjs tests/rift-audio-integration.spec.mjs`.

`window.__gameTest.snapshot()` exposes durable state. Deterministic probes test director progression, actual geom attraction/collection and weapon shots, enemy movement/splitting/gravity, life/bomb economics, pause, persistence and afterimage damage. Diagnostics are available in this local single-player demo; no competitive anti-cheat claim.

## Limits
One endless mode and four weapon tiers; no gamepad, online leaderboard, extra modes or account unlocks. Touch tested with browser emulation, not physical devices. Sound generated procedurally, with event tests rather than a subjective listening review.

Built by Merquery with a mechanics subagent; orchestrator handled rendering/UI, pressure tuning, performance profiling, independent playtests and release.
