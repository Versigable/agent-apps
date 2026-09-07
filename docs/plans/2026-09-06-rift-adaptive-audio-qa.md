# RIFT//RUNNER adaptive audio — release QA

## Scope delivered
Options 1, 2 and 3: original adaptive procedural soundtrack, distinctive synthesized effects, and persistent independent mixing. No generated soundtrack, outside audio assets, or new service dependency.

## Verification
- Normal Playwright suite: **40 passed**, `/tmp/rift-audio-final-full`.
- CI-style Playwright install/run: **40 passed**, `/tmp/rift-audio-final-ci`.
- Python suite: **29 passed**.
- `git diff --check`: passed.
- Audio tests verify real signal energy, bar-aligned layer changes, threat/weapon transitions, life-loss drop/rebuild, source limits, priority effects, ducking, hum cleanup, settings persistence, gesture startup, pause/resume, capture tracks, disposal, and actual chord-matched oscillator frequencies.
- Parent review added failing regressions for asynchronous start/pause races and fixed-scale pickup pitches before fixing both.
- Integration verifies keyboard slider navigation does not move the ship; blur suspends audio; phone mixer leaves its toggle reachable. Screenshot QA found the initial phone panel covered its toggle; failing bounds test preceded the positioning fix.
- Final 390x844 emulation: no overflow, no page errors, running AudioContext, panel x=98/y=242/right=378/bottom=458.59375. Corrected screenshot inspected.

## Real-input recording
`games/artifacts/videos/capture-rift-audio.mjs` drives actual movement, F firing, dash and bomb keys without invulnerability or forced progression. `rift-audio-playtest.json` records no browser errors; progression reached weapon tier 4 and threat 3. Music gained its lead, added percussion, dropped to its sparse arrangement after life loss, and rebuilt. Highest-threat arpeggio activation is separately covered by the real AudioContext arrangement test.

The capture combines the game's canvas stream with the real post-master stereo mix in one MediaRecorder. No substitute track or post-dubbed effects.

- Raw capture: `games/artifacts/videos/rift-adaptive-audio.webm`; decoded audio runs 44.33 seconds, stereo Opus at 48 kHz. FFmpeg measured mean -34.8 dBFS / peak -13.5 dBFS: conservative headroom, no captured clipping.
- Delivery: `games/artifacts/videos/rift-adaptive-audio.mp4`; **25 seconds**, H.264 + stereo AAC, **4,967,564 bytes**, ffprobe verified both streams.
- Mixer screenshots: `games/artifacts/videos/rift-audio-mixer.png`, `games/artifacts/videos/rift-audio-mobile.png`.
- Standard ten-second arcade artifact refreshed, `consoleErrors: []`, `ok: true`. Standard recorder is silent; use the adaptive-audio MP4 for sound.

## Limits and self-assessment
Browser emulation and measured audio verification, not physical-device or subjective listening review. One procedural score, not a library of produced tracks. Original game scope remains one endless mode without gamepad support.

Self-rating (not an external benchmark): gameplay 8/10, controls 8/10, visual clarity 9/10, performance 9/10, replayability 8/10, self-test quality 9/10.
