# High Noon, Low Temperatures

A playful 3D shared-screen snowball western. Sundance Chill and Calamity Snow defend Rattlefrost against three waves of snowman outlaws. Built with local Three.js and original procedural meshes—no remote assets or CDN.

## Play

- Homelab preview: https://game-preview.ninjaprivacy.org/games/snowdown/ (existing sign-in protection applies).
- Local: `npm ci && npm run serve:preview`, then http://localhost:4173/games/snowdown/.
- Choose **Ride together** for two-player couch co-op or **Lone ranger** for solo.
- P1: **WASD** move, hold **F** to throw, **G** dodge.
- P2: **arrow keys** move, hold **K** to throw, **L** dodge.
- Standard controllers: **left stick** move, **A / right trigger** throw, **B** dodge, **Start** pause/resume (press again; holding never toggles repeatedly). Browser gamepad slots 0 and 1 control P1 and P2. Press a controller button to make the browser recognize it.
- **Escape / P** pauses; resume with keyboard or the on-screen button. Sound is optional and starts muted.

Throws have a 160 ms visible windup before release, with nearest-outlaw auto-aim at release and recoil afterward. Player markers identify P1/P2; each HUD shows throw and dodge cooldowns. Throws assist toward the nearest outlaw. No friendly fire. Dodge pink enemy snowballs, collect cocoa to heal, and stand beside a frozen partner to revive them. Clear all three waves to win; both players frozen ends the run. Restart or change posse from the end menu.

## Scope and limitations

Desktop browser with WebGL required. Local shared-screen co-op, not online multiplayer. No phone touch controls. Controller input is tested with simulated standard Gamepad API devices, not physical hardware. Same-keyboard multi-key rollover varies by keyboard. Camera is a fixed elevated orthographic view; movement is screen-relative on the ground plane for both keyboard and controllers. Dodging follows current/last movement rather than auto-aim. The default gameplay video is silent (Playwright screen recording).

Simulation uses fixed 1/120-second substeps, consuming real frame deltas up to 250 ms per frame (at most 30 steps); excess from longer stalls is dropped rather than queued. Pause/blur clears accumulated time and resume resets the wall clock, so no paused time catches up. This corrects simulation slow-motion, not low renderer FPS. Static batching, baked town shadows, Lambert materials and adaptive drawing-buffer resolution remain intact.

## Verification

`KANBAN_MODE=fixture npm test` runs the repository browser suite. Snowdown coverage includes two players moving/firing/dodging, standard controllers and disconnection identity, collisions and enemy retaliation, revival, healing, wave completion, defeat, solo, pause and restart.

`ARTIFACT_VIDEO_MS=10000 npm run artifacts:video -- snowdown` records actual two-player keyboard input, with read-only before/after gameplay evidence and a screenshot. No forced progression is used for that capture.

`window.__snowdown.snapshot()` is read-only state for verification. Mutation helpers (`frameDelta`, `step`, `encounter`, `fire`, `enemySnowball`, `down`, `place`, `cocoa`, `clearWave`) exist only with `?test=1`; that mode disables automatic simulation and is for deterministic tests, not human play.

## Provenance

Merquery orchestrated and integrated a Hermes builder, research/media lanes, independent reviews and rendering-performance work. The builder created the procedural town, game and combat tests; Merquery added independent two-controller verification, real-input video capture and arcade integration. No claim of separate DrClawBotNik or Kodor execution.
