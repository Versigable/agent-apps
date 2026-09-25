# Request routing — `handler`

**Source revision:** `a3da91f69d24c14f6612b2a1fcdae7d2abb4f1b4` · **Verified on:** 2026-09-24 (static inspection) · **Evidence:** verified-at-revision · **Implementation:** live/wired source · **Runtime:** not checked · **Owner / approval owner:** unknown.

## Purpose and connections

[`scripts/preview-service.mjs`](../../scripts/preview-service.mjs), `http.createServer` and `handler` (lines 105–153), dispatch HTTP requests to the Kanban bridge, redirects, health, a game manifest wrapper, or static files. [`package.json`](../../package.json), `scripts.serve:preview` and `scripts.serve:games`, invoke this same file. Despite its name, `serve:games` only sets the bind host; it does **not** set `PREVIEW_SURFACE=games`.

`previewSurface` defaults to `all`; `servesApps` and `servesGames` (lines 13–21) recognize exact values. This setting is read at process initialization. The following summarizes source behavior, not live endpoint probes:

| Surface | `/` (302 destination) | Static namespaces | `/api/kanban/…` | `/__preview/manifest` |
| --- | --- | --- | --- | --- |
| `all` (default) | `/games/arcade/` | apps, games, Three.js build | delegated to bridge | game registry + `resolvedAt` |
| `apps` | `/apps/` | apps | delegated to bridge | 403 |
| `games` | `/games/arcade/` | games, Three.js build | static fallback rejects with 403 | game registry + `resolvedAt` |

Unknown nonempty surface values make both predicates false: `/` still redirects to the arcade, static namespaces are denied, and health still returns `ok: true`. There is no startup surface validation in this file. Do not interpret successful health as configuration correctness.

## Ordered flow and invariants

All claims below cite [`scripts/preview-service.mjs`](../../scripts/preview-service.mjs) at the revision above:

1. `handler` checks the app-gated `/api/kanban/` prefix **before** static routing and calls `handleKanbanRequest(req, res, { repoRoot })`. Exposure is not write authorization; follow [the consumer boundary](preview-consumers.md).
2. Root redirect chooses the app dock only when `servesApps() && !servesGames()`. The arcade wins in combined mode. App-enabled `/apps` and `/apps/kanban` receive 308 trailing-slash redirects. Preserve slash behavior because launcher assets and manifest fetches use relative URLs.
3. `/healthz` is surface-independent; `healthPayload` (lines 46–61) reports `ok`, service, surface and conditional advertised URLs. No commit, bridge write flags, task-store probe or external dependency inventory is included. `PREVIEW_PUBLIC_URL` affects advertised URLs, not the request gate.
4. `/__preview/manifest` explicitly requires games, reads `games/manifest.json` and adds request-time `resolvedAt`; this is neither an app manifest nor a build/deployment timestamp. Apps use static `/apps/manifest.json` instead.
5. `safeStaticPath` (lines 63–81) decodes and normalizes paths, permits only the enabled `apps/`, `games/` and game-side `node_modules/three/build/` namespaces, rejects dot-prefixed segments and checks resolved repository containment. Preserve these checks when adding assets; this is not evidence of a comprehensive security audit.
6. `serveStatic` (lines 83–103) resolves directories to `index.html`, gives HTML/JSON `no-store`, other assets a 60-second public cache, and distinguishes denied paths (403) from missing allowed files (404). Handler failures reach the server's JSON 500 catch.

## Decisions and scoped change impact

- **Documented:** [README, “One-click internal preview”](../../README.md#one-click-internal-preview) describes independent app/game targeting. The tracked unit configuration and browser consumers are mapped [next](preview-consumers.md).
- **Inferred:** surface predicates centralize separation across routes and advertised links; trailing-slash normalization protects relative browser requests. **Unknown:** historical reason for arcade priority in `all`; no decision record was established in this inspection.
- Predicate changes affect API reachability, root selection, app slash redirects, static allowlists, manifest access, health fields and startup logging together. Review all these uses, not just the root conditional.
- Changing only the root destination does not directly change `safeStaticPath` or bridge capability computation in the inspected functions. It still changes browser navigation, and downstream/external effects are not proven absent.
- Adding Kanban to `games` is an API exposure change into the existing bridge, not merely a launcher link change. Do not broaden all app/static access accidentally or silently change bridge write/execution defaults.

## Verification and refresh

[`tests/preview-workflow.spec.mjs`](../../tests/preview-workflow.spec.mjs), at the same baseline:

- `preview surface mode separates app-preview from game-preview routes` (lines 126–159): apps root destination, slash redirect, health-field separation, both static surfaces, bridge health gate, and **apps-only manifest-wrapper 403** versus games 200.
- `preview service exposes health and denies repo-private paths` (lines 86–103): combined surface, manifests, Three.js and selected denied paths. These selected paths are not a complete traversal test.
- `app preview dashboard renders registered operator apps` and `arcade renders one-click preview and artifact actions`: immediate browser consumers.

**Last execution:** not run; assertions were read only. The inspected suite does not explicitly assert the combined-mode root redirect or invalid-surface behavior; those claims above come from source. Add focused coverage if changing them. See [index verification rules](index.md#verification-and-refresh-contract) before any authorized test run.

**Refresh when:** `handler`, surface predicates, static validation/cache behavior, advertised fields, manifest shape, entry scripts or route assertions change. Check the [consumer card](preview-consumers.md) in the same review.
