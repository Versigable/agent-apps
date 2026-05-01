# Neon Breach — FPS Gauntlet

A browser-native Three.js first-person shooter prototype for evaluating agent-built game workflows.

## Play locally

From the repo root:

```bash
npm install
npm run serve:games
```

Open: <http://127.0.0.1:4173/games/fps-gauntlet/>

## Controls

- `W/A/S/D` — move and strafe
- Mouse — look around after pointer lock
- Left click — fire
- `F` — fire fallback for headless tests
- `Space` — boost jump
- `Shift` — sprint

## Enemy classes

- Skitter — fast, fragile red drones worth 20 points.
- Brute — slower amber heavies with bigger collision silhouettes worth 45 points.
- Warden — cyan hovering drones with tall profiles worth 35 points.

## Arena readability

- Central reactor landmark anchors orientation in the middle of the vault.
- Colored north/east/south/west quadrant towers and signage make callouts easier.
- Brighter boundary walls and low cover barricades help players read playable space while strafing.

## Weapon and damage feedback

- Firing the pulse carbine now kicks the reticle and shows a short green/cyan muzzle flash near the crosshair.
- Enemy hits flash a hit marker at screen center and spawn a floating damage pop near the impacted drone.
- Player damage triggers a red breach flash around the screen edge plus a health-card pulse.
- The `#game-root` exposes deterministic Playwright hooks: `data-muzzle-flashes`, `data-hit-markers`, `data-damage-flashes`, `data-last-shot-feedback-at`, `data-last-hit-marker-at`, `data-last-damage-at`, and active-state flags for each feedback effect.

## Testing

From the repo root:

```bash
npm test
```

In a fresh/CI environment, use:

```bash
npm run test:ci
```

Playwright opens the arcade and this game, starts a run, presses movement/fire keys, checks HUD state, checks console errors, and captures screenshots under ignored artifact paths in `games/artifacts/test-results/`.

## Human scorecard

Rate each item from 0–10 after playing:

- Gameplay
- Controls
- Visual clarity
- Performance
- Replayability
- Agent self-test quality

## Next iteration ideas

- Audio pass for fire/hit/death/wave/damage feedback.
- Pause/restart controls and death/menu polish.
- Weapon pickups and reload/overheat tuning.
- Automated 10-second gameplay video capture.
- GitLab Pages preview for one-click Discord testing.
