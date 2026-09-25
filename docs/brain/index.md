# Preview routing repo brain

A source-navigation map, not a replacement specification or deployment receipt. Start with the relationship you are changing, then verify its cited source.

## Evidence boundary

- **Source revision:** `a3da91f69d24c14f6612b2a1fcdae7d2abb4f1b4` (all source citations in this directory refer to this baseline).
- **Verified on:** 2026-09-24, by static source/test inspection and local link/symbol checks only.
- **Implementation:** live code paths, meaning wired in source, not observed deployment.
- **Evidence:** verified-at-revision; **runtime:** not checked; **tests:** inspected, not run for this map.
- **Owner / approval owner:** unknown; no ownership assignment established in the inspected material.
- Inspected on branch `docs/repo-brain-pilot`, HEAD `3a4ff139de92230edf8ead9b508709cb2e7ae6dc`, initially clean. HEAD adds only the pilot protocol to the baseline; inspected source remains identical.

## Choose a path

| Change or unfamiliar term | Read next | Owning entry point |
| --- | --- | --- |
| Landing page, operator dock, arcade, surface selection, redirects, static assets, manifest endpoint | [Request routing](preview-routing.md) | [`scripts/preview-service.mjs`](../../scripts/preview-service.mjs): `handler`, `safeStaticPath` |
| Kanban reachability versus write permission, health semantics, launchers, capture tooling, deployment configuration | [Immediate consumers and capability boundary](preview-consumers.md) | `handleKanbanRequest`, launcher `loadManifest`, capture `healthOk` |
| Pilot scope and evaluation procedure | [Approved protocol](../plans/2026-09-24-repo-brain-pilot.md) | Protocol, not an evaluation result |

The flow is **process configuration → surface predicates → ordered HTTP dispatch → bridge or allowlisted static file → browser/tool consumer**. Health is a separate observation path, not proof that the rest of this flow succeeds. Keep route exposure, bridge capability, and deployment identity distinct.

## Verification and refresh contract

Existing source, tests and [README](../../README.md) remain authoritative. Cards name the focused assertions in [`tests/preview-workflow.spec.mjs`](../../tests/preview-workflow.spec.mjs), including `withPreviewSurface`; [`playwright.config.mjs`](../../playwright.config.mjs), `webServer`, governs server setup. No test or service was started for map authoring. The protocol's test execution and independent-reader acceptance criteria remain separate from static map authoring; see the [pilot evidence package](../brain-pilot/README.md) for those results. Fixture tests do not establish deployed runtime state.

Update affected cards in the same change when routes, predicates, environment contracts, bridge capabilities, consumers, tests or ownership change; otherwise document why there is no map impact. Compare cited symbols and incoming callers, not just path existence. Advance revision/date only after semantic reinspection; mark stale when that cannot be done. Record any future runtime receipt separately without turning this static verification into a deployment claim.

## Limits and rationale

**Documented rationale:** [README, “One-click internal preview”](../../README.md#one-click-internal-preview) describes separately targetable app/game surfaces; the cards connect that intent to code. **Inferred rationale** is labeled on the cards; historical reasons not present in inspected sources are **unknown**.

Coverage is the preview dispatcher and selected immediate consumers, not an exhaustive dependency graph or security audit. External clients, deployed reverse-proxy/access controls, installed units, live task stores, running revisions, cron and other repositories are uninspected and **unknown**, not absent. No claim that unrelated apps or Python utilities are unaffected follows from this slice.
