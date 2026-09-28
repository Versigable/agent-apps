# Shared scoped operator WRITE checkpoint plan

Source-only sole-writer scope, after approved READ review; no activation/deployment/commit. Inherited detached working tree at `3e5fb4309dff0db0d421f49df6b3b41467ef4acc` contains prior static/publisher/native/read checkpoints. Preserve those bytes except explicitly released operator CI integration.

## Architecture and boundaries

Protected gamedev and app-preview share existing 4175 process, authoritative IDs/history/store and one evidence lock module. Public game-preview remains standalone static-only 4173. Extract command/domain operations from general bridge into a shared module; both HTTP adapters call these operations, never proxy the general router. Scoped board is always default. Write/read flags remain default disabled and are NOT authentication. Host/Origin/session-CSRF/operator-group/frontend integration and external-writer serialization remain activation gates.

Minimum map: existing docs/brain preview-routing + preview-consumers cards, linked canonical write contract. Navigation question: where does a playtest observation become a persisted task, and what prevents a queued evidence retry from attaching to a reclassified game? Incoming consumers: general bridge + scoped API, capture/evidence validators, readonly snapshot helper, existing app tests, CI. Source owner: parent integration/reviewer (not yet named); infrastructure approval: metaversig. Runtime/ingress and external CLI success unverified.

## Vertical implementation sequence (test before source)

1. Record frozen hashes and baseline existing regressions. Persist isolated SQLite fixture harness using a deliberately labeled synthetic CLI, never production DB.
2. RED scoped comment roundtrip; extract reusable command functions and shared lock/membership/readback wrapper; GREEN. Shared general adapter uses same command implementation and lock keys. Keep existing general response compatibility.
3. RED create/capture and retries; canonical metadata, strict scoped allowlists, fixed board, parent membership, serialized idempotency validation and exact persisted readback. Preserve capture byte validation and author attribution.
4. RED each ordinary management/dependency/evidence family; scoped archived policy, deterministic endpoint locks, after-lock membership validation, exact-target archive readback, concurrent cross-adapter evidence and create retries, conflict/failure/lost-response behavior. Preserve broad execution only on general adapter.
5. Expand adversarial HTTP, persistence and concurrency matrix; exercise installed isolated CLI without removing delegation guards. Report refusal exactly, not as success.
6. Explicit npm/CI operator suite integration; full existing browser, build/static, Python/map regression and diff checks. Update canonical contract + map (retain historical evidence hashes with stale reason). Record final exact tests/files/frozen hashes in released external checkpoint.

## Concurrency guarantee to prove and bound

One shared in-process lock map serializes participating adapters using canonical DB identity and task keys, plus creation retry keys; dependency endpoints acquired in sorted order. Membership is reread after locks and readback is authorized again. External CLI/SQL writers do NOT participate: this is not an atomic cross-process check-and-write authorization guarantee. Activation requires exclusive classification ownership or a separately reviewed transaction-capable writer; no guard bypass or new production DB implementation here.

## Verification

Node operator tests with installed-schema environment (zero skips), explicit persisted synthetic CLI SQLite roundtrips in both directions, existing 120-test Playwright baseline/final, build-download/static Node suites, `uv run --frozen pytest -q`, brain checker/inventory, `git diff --check`, syntax and protected SHA-256 comparisons. No gameplay changes or media generation; ephemeral isolated test listeners only.
