# High Noon, Low Temperatures

A playful 3D shared-screen snowball western. Sundance Chill and Calamity Snow defend Rattlefrost against three waves of snowman outlaws, then the Moonwalk Marshal mini-boss. Built with local Three.js and original procedural meshes—no remote assets or CDN.

## Play

- Homelab preview: https://game-preview.ninjaprivacy.org/games/snowdown/ (existing sign-in protection applies).
- Local: `npm ci && npm run serve:preview`, then http://localhost:4173/games/snowdown/.
- Choose **Ride together** for two-player couch co-op or **Lone ranger** for solo.
- P1: **WASD** move, hold **F** to throw, **G** dodge, hold/release **H** for Big Ol Snowball.
- P2: **arrow keys** move, hold **K** to throw, **L** dodge, hold/release **J** for Big Ol Snowball.
- Standard controllers: **left stick** move, **A / right trigger** throw, **B** dodge, hold/release **X (button 2)** for Big Ol Snowball, **Start** pause/resume (press again; holding never toggles repeatedly). Browser gamepad slots 0 and 1 control P1 and P2. Press a controller button to make the browser recognize it.
- **Escape / P** pauses; resume with keyboard or the on-screen button. Sound is optional and starts muted.

Throws have a 160 ms visible windup before release, with nearest-outlaw auto-aim at release and recoil afterward. Player markers identify P1/P2; each HUD shows throw and dodge cooldowns. Throws assist toward the nearest outlaw. No friendly fire. Dodge pink enemy snowballs, collect cocoa to heal, and stand beside a frozen partner to revive them. Clear three waves, then defeat the Moonwalk Marshal to win; both players frozen ends the run. Restart or change posse from the end menu.

## Big Ol Snowball and the Moonwalk Marshal

Charge for up to 1.4 seconds: the held ball visibly grows and each player has a charge meter. Release to bowl through multiple snowmen, hitting each enemy only once per roller (2–5 damage before boosts). Hold normal fire on the other player to feed it: nearby partner rollers within 9 world units receive predictive auto-aim priority until maximum size. Each ordinary snowball is consumed on contact, boosts size/power once, and cannot boost its owner's roller. Enemy snowballs never boost. Neither attack harms partners. Boosting applies only to launched rollers, not held balls.

Rollers last at most 5 seconds, stop at scenery or town bounds, cap at radius 2.2 and damage 9, and at most 8 exist. Flying hats cap at 12 with 2-second lifetimes; snow particles cap at 180. Pause/blur cancels held charges without firing and freezes existing rollers/effects. Restart clears charges, rollers, boss, effects and counters. A held controller X after resume begins a fresh charge.

After wave three, a larger snowman in an original procedural fedora and jacket arrives with one sparkling glove and animated sliding feet. The boss HUD shows health and action; a red carpet and text telegraph fan volleys and a backward-facing moonwalk dash. Below half health, the encore uses faster volleys and shorter recovery. Health is 30 solo / 50 co-op; the posse is healed for the showdown. Defeat launches a silly flying hat. This is a playful Michael Jackson-inspired visual reference, not a likeness asset: no recorded music, sampled voice, or licensed recording is used, only optional original oscillator effects.

## Scope and limitations

Desktop browser with WebGL required. Local shared-screen co-op, not online multiplayer. No phone touch controls. Controller input is tested with simulated standard Gamepad API devices, not physical hardware. Same-keyboard multi-key rollover varies by keyboard. Camera is a fixed elevated orthographic view; movement is screen-relative on the ground plane for both keyboard and controllers. Dodging follows current/last movement rather than auto-aim. The default gameplay video is silent (Playwright screen recording).

Simulation uses fixed 1/120-second substeps, consuming real frame deltas up to 250 ms per frame (at most 30 steps); excess from longer stalls is dropped rather than queued. Pause/blur clears accumulated time and resume resets the wall clock, so no paused time catches up. This corrects simulation slow-motion, not low renderer FPS. Static batching, baked town shadows, Lambert materials and adaptive drawing-buffer resolution remain intact.

## Verification

`KANBAN_MODE=fixture npm test` runs the repository browser suite. Targeted: `KANBAN_MODE=fixture PLAYWRIGHT_PREVIEW_PORT=4295 npx playwright test tests/snowdown*.mjs --output=/tmp/snowdown-boss-tests --reporter=list`. New boss tests verify keyboard/controller charge, multi-target bowling, partner-only consumption and real-input boost assist, lifecycle cleanup, telegraphs, boss damage/victory and HUD separation. Snowdown coverage includes two players moving/firing/dodging, standard controllers and disconnection identity, collisions and enemy retaliation, revival, healing, wave completion, defeat, solo, pause and restart.

`ARTIFACT_VIDEO_MS=10000 npm run artifacts:video -- snowdown` records actual two-player keyboard input, with read-only before/after gameplay evidence and a screenshot. No forced progression is used for that capture.

`window.__snowdown.snapshot()` returns detached read-only verification data: boss health/max/phase/clock/position/warning/encore, volley/dash counts, roller owner/position/radius/power/lifetime/hit/boost counts, total launches/hits/boosts and per-player charge/held radius/charged throws. No mutable scene objects are exposed. Mutation helpers (`frameDelta`, `step`, `encounter`, `fire`, `enemySnowball`, `down`, `place`, `cocoa`, `clearWave`, `bowlingSetup`, `rollerShot`, `bossTarget`) exist only with `?test=1`; that mode disables automatic simulation and is for deterministic tests, not human play.

## Provenance

Merquery orchestrated and integrated a Hermes builder, research/media lanes, independent reviews and rendering-performance work. The builder created the procedural town, game and combat tests; Merquery added independent two-controller verification, real-input video capture and arcade integration. No claim of separate DrClawBotNik or Kodor execution.
