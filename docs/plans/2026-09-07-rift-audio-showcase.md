# RIFT//RUNNER — audio polish and friends showcase

## Scope
- Improve demonstrably quiet gain staging without replacing the procedural soundtrack.
- Retain mute, separate saved mixer controls, pause lifecycle and source limits.
- Verify actual default-level and full-level signal, with stress effects and silence after mute.
- Play through real keyboard inputs, reading snapshots only for navigation; no forced progression, invulnerability or state edits.
- Capture a longer continuous combat excerpt with synchronized post-master audio, title and live HUD values. Recording-only canvas layout does not modify the game.

## Acceptance
- Focused audio tests, full browser tests, CI-style browser tests and Python regressions pass.
- Final MP4 has H.264 video and stereo AAC audio, readable inspected frames, measured non-clipping audio and no browser page errors.
- Explicit game/test/docs commit, remote readback. Generated captures remain ignored.

## Final verification and delivery
- Normal browser suite: **42 passed**, `/tmp/rift-showcase-tests.log`.
- CI-style install/browser suite: **42 passed**, `/tmp/rift-showcase-ci.log`.
- Python suite: **29 passed**. `git diff --check` passed.
- Audio builder added 3x makeup plus final protective compressor, shared by playback/capture/analyser; 20ms mixer/mute ramps; actual gain telemetry preserved with separate target values.
- Live PCM tests cover default score loudness, maximum-volume overlapping FX with zero clipped samples, and settled mute silence.
- Parent replaced a flaky realtime callback-based adjacent-sample ramp test with sample-accurate OfflineAudioContext rendering. An abrupt-gain mutation failed as expected; production smoothing passed five repeats and both full suites. No weaker delta threshold was used.
- Final real-input run: **53,932,000 score**, threat **7**, weapon tier **4**, **2 lives remaining**, all three bombs used, no page errors. 98 wall seconds / 93.8213 simulation seconds. Keyboard movement, dash, bombs and the game's built-in F auto-aim; no forced progression, health or enemy manipulation.
- Capture-only composition adds branding and live HUD values around the actual game canvas. Its script and telemetry remain in ignored `games/artifacts/videos/capture-rift-showcase.mjs` and `rift-friends.json`.
- Delivery `games/artifacts/videos/rift-runner-friends.mp4`: continuous final **60 seconds**, **1280x840 / 30fps H.264**, **48kHz stereo AAC**, **8,982,654 bytes**. Actual synchronized game mix, only start/end fades; no dubbed music.
- Decoded final audio mean **-21.1 dBFS**, peak **-1.5 dBFS**. Full final video decode passed; three decoded contact-sheet frames inspected for HUD readability, visible activity and cropping.
- Two-pass export hit FFmpeg frame-count mismatch/SIGSEGV; replaced by a successful single-pass bounded-bitrate export, then verified the replacement container and full decode.
- Remaining limitation: measured/browser audio QA, not physical-device or subjective listening review. Public playable URL still uses existing homelab authentication.

## First practice run
65 wall seconds; 63.1587 simulation seconds; 23,670,400 score; three lives remaining; reached threat 5 and weapon tier 4. No page errors. Practice is not the final deliverable.
