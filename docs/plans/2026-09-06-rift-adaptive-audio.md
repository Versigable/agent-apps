# RIFT//RUNNER adaptive audio

## Authorized scope
Implement options 1, 2 and 3 only: original procedural adaptive music, differentiated synthesized effects, and a proper persistent mixer. No generated/rendered external soundtrack, service integration or third-party music licensing work.

## Architecture
- `audio.js`: standalone WebAudio engine. AudioContext starts only from user interaction. Clock-based lookahead scheduling, bar-aligned arrangement changes, independent music/SFX gains, ducking and compression.
- `game.js`: named event integration, gameplay-to-arrangement state, lifecycle pause/resume, and saved mixer controls.
- Existing visual renderer and combat mechanics unchanged.
- Capture audio directly from the engine's master MediaStream destination, not from a microphone or simulated waveform.

## Sound direction
Original minor-key electro/breakbeat: drums and pulse bass with threat-driven arpeggios/percussion and weapon-driven lead; brief stripped-back recovery after life loss. Distinct tiered gunfire, musical pickups, stereo dash, glassy splitting, proximity gravity hum, nova suction/impact/tail.

## Acceptance
- Real AudioContext output energy; volume levels and mute survive reload.
- Pause/tab loss suspends audio; resume works after a gesture without duplicated schedulers.
- Bounded simultaneous voices and prioritized effects; pickup/fire coalescing, impact ducking.
- Musical changes only at bar boundaries, with a documented intensity mapping.
- Test keyboard range controls without moving the player.
- Normal + CI browser suite and Python regression pass.
- Actual mixed gameplay recording includes audio; inspect stream metadata/levels and UI screenshots.
- Explicit-file commit, remote verification and live asset checks.
