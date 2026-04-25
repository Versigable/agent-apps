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
- `Shift` — sprint

## Testing

From the repo root:

```bash
npm test
```

Playwright opens the arcade and this game, starts a run, presses movement/fire keys, checks HUD state, checks console errors, and captures screenshots under `games/artifacts/`.

## Human scorecard

Rate each item from 0–10 after playing:

- Gameplay
- Controls
- Visual clarity
- Performance
- Replayability
- Agent self-test quality

## Next iteration ideas

- Weapon pickups and reload/overheat tuning.
- Enemy variants: chargers, snipers, shield drones.
- Level chunks instead of one arena.
- Automated 10-second gameplay video capture.
- GitLab Pages preview for one-click Discord testing.
