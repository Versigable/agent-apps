# Signal Salvage

Signal Salvage is a top-down neon extraction game for the Agent Game Arcade workflow pilot. You pilot a recovery drone through a collapsing signal field, collect cyan signal cores, dodge red interference sentries, and keep the uplink alive until the extraction timer expires.

## Controls

- `W/A/S/D` or arrow keys: move the salvage drone
- `F`: pulse-scan nearby signal cores
- Pointer/touch drag: reposition the drone for manual play
- `Enter`: restart after a win/loss state

## Test hooks

The game exposes deterministic state for Playwright and future OpenClaw QA agents:

- `#game-root[data-state]`: `idle`, `running`, `won`, or `lost`
- `data-signal`, `data-score`, `data-cores-collected`, `data-hits`, `data-time-left`
- `window.__signalSalvageTest.start()`
- `window.__signalSalvageTest.collectCore()`
- `window.__signalSalvageTest.forceCollision()`
- `window.__signalSalvageTest.winRun()` / `loseRun()`
- `window.__signalSalvageTest.movePlayer(x, y)`

## Workflow note

This game is the first workflow-standardization pilot for the OpenClaw helper-agent roster: Architect defined the test hook contract, Scribe drafted the arcade copy, Critic identified smoke-test risks, and Merquery implemented/verified the shippable vertical slice.
