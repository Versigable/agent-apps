# Snowdown — Big Ol' Snowballs / Moonwalk Marshal verification

## Delivered

- H/J or standard controller X: hold to grow a visible snowball, release to launch a multi-target roller. F/K/A/RT rapid throw and existing screen-relative movement/dodge remain intact.
- Actual partner-projectile collision increases roller size/power. Owner/enemy shots cannot boost it. Roller targets are hit once per roller; growth, lifetime and active entity counts are capped.
- Exactly three regular rounds followed by the Moonwalk Marshal: original procedural Michael Jackson-inspired snowman with fedora, single glove, moonwalking footwork/dash, volley telegraphs, boss HP/phase HUD and an encore phase below half health. Victory requires boss defeat.
- Flying hats and whimsical frontier announcements. No sampled music, artist voice or copied lyrics; capture is silent.

## Verified execution

- `KANBAN_MODE=fixture npm test`: **60 passed**.
- `KANBAN_MODE=fixture CI=true npm run test:ci`: **60 passed**.
- `uv run pytest`: **29 passed**.
- Independent spec/quality review initially caught charged-controller disconnect and inaccurate volley-preview geometry. Both fixed with failing-then-passing regressions. Focused rereview: **SPEC PASS / QUALITY APPROVED**, independently executing the three release regressions.
- Live public page returned HTTP 200; private repository path returned 403. No access-control changes.

The release tests exercise actual game simulation and real Three.js scene geometry in a VM with only browser/GPU I/O stubbed. They verify controller disappearance cancels charge without reassigning the other pad, intentional releases still launch, and each base/encore projectile trajectory lies inside its corresponding actual warning mesh through nominal lifetime. Volley spread/speed are locked at warning onset, including half-health crossing. Browser tests also assert boss/announcement panels do not overlap.

## Natural gameplay evidence

`ARTIFACT_VIDEO_MS=50000 npm run artifacts:video -- snowdown` drove real keyboard movement, rapid throws, alternating charge/release and dodge at the ordinary URL. Only read-only snapshots were used: no invulnerability, forced progression, health edits or test hooks.

Final capture naturally reached the boss after wave three and won:

- **9** charged rolls, split **5 / 4** between players.
- **14** partner boosts, **6** roller hits.
- **150** ordinary throws; **18** dodges.
- Boss performed **2** volleys and **2** moonwalk dashes.
- Final boss HP **0 / 50**, state `won`, score **3150**.
- Players took actual hits and used normal game healing; their health was never externally edited.

Media (ignored generated artifacts):
- `games/artifacts/videos/snowdown-moonwalk.mp4`: last 20 seconds of the real run, 1280×720 H.264, exactly 20.000 seconds, 1,122,118 bytes; probed and decoded without errors.
- `games/artifacts/videos/snowdown-moonwalk-contact.png`: decoded opening/middle/late/outcome frames inspected.
- `games/artifacts/test-results/smoke-screenshots/snowdown-boss-latest.png`: natural boss screenshot inspected.
- Deterministic volley-warning screenshot also inspected to confirm five readable lanes and separated HUD text.

## Limits and self-score

Software WebGL in the isolated CI-equivalent sample rendered **14.49 FPS**, with 6.0667 simulated seconds over a 6.0061-second wall sample (sampling-boundary differences). A concurrent run was slower. Fixed substeps preserve ordinary simulation timing; this is not a smooth-hardware-FPS claim. Adaptive resolution may soften the 3D scene; HUD remains native resolution.

Provisional agent self-score, not human ratings: gameplay **8/10**, controls **8/10**, visual clarity **8/10**, performance **6/10**, replayability **7/10**, self-test quality **9/10**.

Eric reports friends enjoyed the prior demo. The new charge/boost mechanic, boss difficulty and physical controller behavior still need their feedback; use `docs/plans/snowdown-couch-playtest.md`.
