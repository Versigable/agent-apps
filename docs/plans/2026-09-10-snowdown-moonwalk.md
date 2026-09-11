# Snowdown: Big Ol' Snowball and Moonwalk Marshal

## Approved scope

User says friends love the playable demo. Implement Step 2 (charged rolling snowball that a partner can enlarge by shooting) plus a Michael Jackson-inspired snowman mini boss after three regular rounds, with playful nonsense.

- Preserve ordinary F/K throws and existing movement/dodge/controller controls.
- H/J or controller X: hold to charge, release to launch a visible bowling snowball.
- Partner projectiles boost size/power, bounded to avoid runaway entities or boss deletion. No friendly fire.
- After wave three, spawn the Moonwalk Marshal exactly once. Victory requires defeating him.
- Original procedural bigger snowman with fedora, one glittery glove, physical moonwalk/dance moves and telegraphed attacks. Boss HP/phase HUD. No copied music recording, lyrics or sampled voice.
- Add restrained flying hats and silly frontier announcements; preserve original performance work and pause/restart safety.

## Acceptance

Test charge/release for both keyboard/controller inputs, multi-target rollers, partner-only boost, growth caps, boss sequencing/attack damage/victory, solo balance, pause/blur/restart cleanup and prior co-op regressions. Use deterministic test-only hooks for behavior tests; showcase uses normal URL and real input only, with read-only telemetry and inspected video.

## Lanes and verification

Builder owns game and Snowdown tests. Media lane reads risks/capture strategy. Parent integrates manifest, verification docs, live-input capture and explicit-path commit; independent spec/quality review follows implementation.

Full gates: `KANBAN_MODE=fixture npm test`, `KANBAN_MODE=fixture CI=true npm run test:ci`, `uv run pytest`, actual screenshot/video QA, reachable live source verification and verified GitLab push. Use helper port4295 and unique /tmp output; internal fixture ports4195/4196 are reserved.

Do not broaden to extra maps, online multiplayer or replacing the previously shipped controls. User reported friends enjoy the prior build; new mechanic and boss still need their playtest feedback.
