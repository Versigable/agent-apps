# Vector Overdrive — release QA

## Execution evidence
- `KANBAN_MODE=fixture PLAYWRIGHT_PREVIEW_PORT=4189 npm test -- --reporter=list --output=/tmp/rift-v2-full`: 31 passed.
- `CI=true KANBAN_MODE=fixture PLAYWRIGHT_PREVIEW_PORT=4189 npm run test:ci -- --reporter=list --output=/tmp/rift-v2-ci`: 31 passed.
- `uv run pytest`: 29 passed.
- Standard 10-second artifact workflow: zero console errors, active gameplay screenshot inspected.
- Real-input showcase used keyboard movement, held F, dash and one bomb; it only read snapshots, with no progression or invulnerability manipulation. Final simulation time 80.15s, threat6, weapon4, score39573200, two lives, 1869 collected geoms. Full recording84.24s; Discord excerpt25s.
- Desktop title and crowded threat4 arena visually reviewed at1440x900; color-coded enemies, geoms, ship, shots and HUD readable.
- Phone title/active arena reviewed at390x844; no horizontal overflow, touch fire generated5 shots, no page errors. Physical-device play remains untested.

## Fixes from independent QA
- Initial continuous spawning was too sparse: revised arrivals into small escalating packs, retaining opening grace and population caps. Regression checks a minimum director output and population ceiling.
- Weaver dodge could escape arena: reproduced at bottom edge, added clamp and regression.
- Per-primitive canvas shadow blur caused a local median frame interval66.6ms. Removing those blurs experimentally restored16.7ms; implemented a quarter-resolution whole-scene bloom pass. Final local90-frame initial-wave sample: median16.7ms, p9516.7ms. Not a universal device benchmark.
- Renderer test checks scene immutability, bright combat pixels and zero expensive positive shadowBlur assignments.

## Agent self-rating, not user ratings
Gameplay8/10; controls8/10; visual clarity9/10; performance9/10; replayability8/10; self-test quality9/10.

## Remaining limits
Single endless mode, four weapon tiers, no gamepad support, no remote leaderboard, and balance based on automated play rather than broad human playtesting. Existing public Authentik sign-in remains in place.
