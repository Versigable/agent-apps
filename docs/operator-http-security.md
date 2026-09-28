# Operator HTTP security — source-only integration

**Current source follow-up:** [editable activation contract](game-dev-editable-activation.md) now implements the parent-selected ingress-authenticated, app-CSRF-session architecture and exact shared frontend assets. No Authentik verifier/session identity is invented. The old session/transactional gaps described in this historical slice are superseded by that source contract; live release acceptance remains parent-owned.

**Not deployed by this backend task; not editable migration completion.** This checkpoint changes the existing operator dispatcher, not Authentik, cookies, listener bindings, service units, users or firewall policy. Protected app-preview and gamedev still target one 4175 process and the existing task store. Standalone public 4173 and its immutable ZIP extension are separate packages.

## Owning code and actual route inventory

[`preview-service.mjs`](../scripts/preview-service.mjs) calls [`operatorRequestPolicy`](../scripts/operator-policy.mjs) before dispatch or static reads for `PREVIEW_SURFACE=apps`, port 4175 regardless of surface, or any nonempty `GAME_DEV_PUBLIC_URL`. Such a process never enables the broad games/Three.js asset predicate. Legacy non-4175 `all`/`games` preview without the Game Dev origin is not an authenticated operator deployment; do not expose it as one. Use the separately reviewed standalone public entrypoint.

The general adapter remains [`handleKanbanRequest`](../scripts/kanban-bridge.mjs); the scoped adapter remains [`handleGameDevRequest`](../scripts/game-dev-api.mjs). No new store, copied task IDs, router forwarding, session service or evidence lock is introduced.

All implemented mutations are POST:

| Host scope | Paths |
| --- | --- |
| General app | `/api/kanban/boards`, `/api/kanban/execution/dispatch`, `/api/kanban/tasks`, `/api/kanban/links`, `/api/kanban/tasks/:id/evidence`, `/comments`, `/actions`, `/claim` (the last four suffixes belong to the same task prefix) |
| Game Dev | `/api/game-dev/games/:game/tasks`, `/links`, `/tasks/:id/evidence`, `/tasks/:id/comments`, `/tasks/:id/actions` (all suffixes belong to that game prefix) |

The method-wide middleware covers unknown future unsafe paths too, not only this inventory. Unsupported methods are rejected; OPTIONS grants no preflight permission. Domain adapters retain their bounded JSON body parsers, semantic checks and feature gates. Direct JavaScript calls to adapters in domain tests are not independent authenticated HTTP entrypoints.

## Exact configured Host and Origin

- Existing `PREVIEW_PUBLIC_URL` supplies the app origin. The display URL fallback is **not** a trusted origin fallback.
- New **source configuration contract** `GAME_DEV_PUBLIC_URL` supplies the scoped origin. It is absent by default, so an unconfigured gamedev host is denied instead of aliasing app-preview. This name is not a claim about deployed settings; the integration owner must explicitly supply/review it before routing gamedev.
- Values must equal their canonical URL origin exactly: scheme + hostname + optional non-default port, no path/trailing slash, userinfo, fragment or query. HTTPS is required except explicitly configured HTTP loopback (`127.0.0.1`, `localhost`, `[::1]`) for isolated development. The two configured host authorities must differ; collisions fail closed.
- Every request must carry the exact corresponding Host authority. Unknown aliases, case/trailing-dot/default-port variants, duplicate Host/Origin/Content-Type fields, absolute-form request targets and backslash ambiguity are rejected. These intentionally strict comparisons require the proxy to preserve the canonical external Host. Do not infer it from `Forwarded` or `X-Forwarded-*`.
- Every unsafe request requires **the Origin belonging to its selected Host**, not either member of a shared allowlist. Missing, `null`, sibling-player, other-operator-host and altered origins fail before any backend call. Cookie presence and `X-Authentik-*` identity do not change this decision.
- Writes require `application/json`, optionally `charset=utf-8` (case-insensitive media type/charset). Form/plain/multipart/other charsets fail with 415, even if the bytes contain valid JSON. Duplicate media types are not accepted.
- If Fetch Metadata is present, writes require `Sec-Fetch-Site: same-origin` and `Sec-Fetch-Mode: cors` or `same-origin`. Absence does not replace or relax Origin checks. Metadata is defense in depth, not authentication.
- No operator JSON/static/denial response emits wildcard CORS or grants credentialed CORS. General Kanban JSON drops its old wildcard even in legacy development mode.

App Host retains `/apps/`, general Kanban management and high-friction execution under existing flags. Game Dev Host permits only its scoped API, health, root/slash redirects and four explicit trusted shell files: `games/dev/index.html`, `app.js`, `styles.css` (index served at both directory and explicit paths). No `/api/kanban` fallback, broad `/apps`, game scripts, Three.js or game registry is exposed there. That existing shell remains build/read-only UI; no frontend file was changed. Its old arcade-relative navigation and editable transport remain a separate frontend integration task, not a claim of completed UX.

The local CLI healthcheck uses the configured app Host while connecting to loopback. It is not an authenticated-user/backend-isolation probe and creates no special alias exemption.

## CSRF/session and backend trust decision

The current architecture has **no application-owned authenticated session and no verified session identifier/assertion contract** from the upstream gate. A username header, an arbitrary Cookie string, a domain-wide cookie, Host, Origin or a new local token would not establish binding to an Authentik login. This slice therefore does **not invent sessions, parse identity, add a provider, change cookie scope, or claim a session-bound CSRF token**.

Exact Origin + JSON-only + no operator CORS is the implemented browser request boundary on **both hosts**, including general mutations. Sibling player code is same-site, not same-origin: SameSite cookies alone are not a defense. Non-browser clients can forge Host/Origin; this boundary is not authentication or backend access control. Same-origin compromised operator code also remains inside its trust boundary.

**Session-bound CSRF remains a scoped-editing activation gate.** Keep `GAME_DEV_WRITES_ENABLED` unset/false (and the existing read/live/readOnly gates intact) until the parent/security owner approves a real authenticated session-bound contract or an explicitly reviewed architecture decision. There is no environment switch here that pretends missing identity trust is proven. Missing/invalid exact-origin configuration fails closed in code. Authentication, proxy stripping/preservation and direct backend isolation require independent deployment receipts; spoofed-header denial tests do not prove network isolation. Owner reports an existing openclaw firewall covers trusted backend isolation and offers receipts; these were not independently verified in this source task, and no firewall policy was recreated.

## Verification and release split

[`operator-security.node.mjs`](../tests/operator-security.node.mjs), included in `npm run test:operator`, runs the real dispatcher as temporary child listeners with isolated HOME/SQLite/synthetic CLI. It covers every inventoried mutation family's foreign/null/missing/cross-host Origin and simple forms, Host confusion/forwarded spoofing, duplicate wire headers, Fetch Metadata, canonical configuration, scoped routing, no operator CORS, positive persisted comments through both hosts, default-disabled scoped writes and the local healthcheck. Negative batches compare the DB **and all SQLite sidecars byte-for-byte**; the fixture CLI call log lives in that DB. This is not installed CLI, real authenticated-browser or live ingress evidence.

Independent WRITE review identified R1 (general verification needs persisted IDs missing from installed `show`), R2 (installed canonicalization), and R3 (archived-parent keyed retry). Those **remain separate source blockers for enabling editing**, not blockers to reviewing/deploying this security slice while scoped editing stays disabled. Do not label synthetic positives as closing those defects. Session-bound CSRF, actual installed HTTP adapter validation and outside-writer fencing remain editing gates. The in-process writer queue still cannot prevent another CLI/SQL process changing classification between authorization and commit; readback can fail only after a write has occurred. No transactional guarantee was added.

Owner-relayed Claude review considers the security plan sound and offers source/test review followed by live cross-origin player/text/plain/CORS/Host, static UID/task-store denial, and public ZIP digest checks. These are promised independent checks, not completed evidence. Infrastructure !112 is owner-reported merged; !113 remains draft until **reviewed/deployed 4175 protection**, isolated 4173 and digest-matched public downloads are proved. R1–R3 do not hold that read-only cutover hostage. Only MetaVersig/Firekube merge infra. No commit, push, deployment, restart or production mutation occurred here.

Repo-brain impact: preview-routing/consumers remain **explicitly stale** against their historical evidence hashes, with this checkpoint as the current source contract. Parent owns independent semantic review; infrastructure/runtime state is unverified. See [migration](game-dev-operator-migration.md) and [shared WRITE limitations](game-dev-operator-write.md).
