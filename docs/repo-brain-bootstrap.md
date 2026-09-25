# App-bootstrap contract: code with a maintainable repo brain

Use this checklist when bootstrapping an app or making a material architecture change. Start small: one task-oriented map can be enough. Do not create empty component folders or make a second authority for facts already owned by source, tests, ADRs or runbooks.

This adopts the [repo-brain pilot](brain-pilot/results.md)'s evidence discipline, **not a demonstrated productivity improvement**. Existing-doc and map readers tied. Only mechanical integrity is automated; semantic accuracy remains a reviewer responsibility.

## 1. Scope before implementation

The implementation plan must identify:

- App purpose, entry points, boundaries and owner—or explicitly unknown owner.
- One or more realistic navigation/change questions, including an unfamiliar user term.
- Proposed minimal map location, existing canonical documentation and incoming consumers to inspect.
- Verification commands and acceptance criteria; private dependencies and uninspected runtime/external state must remain explicit unknowns.

For this monorepo, use `docs/brain/` and register scoped cards in its [manifest](brain/manifest.json); the [checker reference](brain/checks.md) defines the schema, supported Markdown and stale-evidence policy. The current preview map is **not** a complete inventory of every app. A new app needs its own scoped entry or a reason why an existing card already covers it. For another repository, use its established documentation/instruction structure; do not copy this repo's hashes, source revisions, service details or ownership assumptions.

## 2. Bootstrap the smallest useful map

- Route from README (or existing AGENTS entry point) to the map in one hop. Preserve existing instruction scopes.
- Map actual process flow and first-order change impact, not merely directory names.
- Cite owning source paths/symbols and relevant tests. Distinguish live/wired source, legacy and planned/unwired paths from **observed deployment**.
- Record source revision, verification date, owner, evidence status and declared source fingerprints in the machine-readable manifest.
- Label rationale documented, owner-reported, inferred or unknown. Scope negative claims: an uninspected consumer is unknown, not absent.
- Link existing specs/ADRs/runbooks rather than duplicating them. Keep credentials and private infrastructure/workplace content out of public repos.

## 3. Implement and verify together

The builder maintains affected map evidence alongside code. The tester checks the implementation and map against actual behavior, then a fresh reviewer follows at least one unfamiliar task from entry point to source/test. A cold walk is not proof of safe implementation or a performance benchmark.

Local mechanical gate:

```sh
uv run --frozen python scripts/check_repo_brain.py
uv run pytest tests/test_repo_brain.py
```

When manifest inputs intentionally change, regenerate the committed inventory:

```sh
uv run --frozen python scripts/check_repo_brain.py --write-inventory
uv run --frozen python scripts/check_repo_brain.py
```

Inventory generation is **not re-verification**. It must not refresh source evidence hashes or dates. Inspect changed source and incoming consumers before manually advancing evidence metadata. Run the relevant application tests separately; passing the brain checker cannot substitute for them.

## 4. Required review decision

Every relevant MR answers:

```text
Repo-brain impact: updated / explicitly stale / none
Affected cards and source evidence:
Changed interface, invariant, dependency, owner, decision or verification path:
Tests and source checks actually executed:
Runtime/external consumers not verified:
If none: why this change has no map impact
If stale: reason, remaining reinspection and accountable reviewer/owner (or unknown)
```

For new apps, missing map coverage needs a specific rationale—not silent omission. For unaffected changes, do not churn timestamps merely to make documentation look recent.

A stale declaration acknowledges incomplete knowledge; it is not permission to ignore an invariant. Reviewers must decide whether the change may land with that uncertainty. Mechanical CI may accept a properly labeled stale card while emitting a warning; it does not approve that risk.

## 5. Mechanical CI versus semantic review

CI checks the declared map's local links/anchors, required metadata, evidence fingerprints and deterministic generated inventory. It does not fetch remote links, prove a cited symbol's meaning, inventory every consumer, verify deployment, resolve unknown ownership or certify security. Source fingerprints detect byte changes in **declared** evidence, not all possible semantic drift. Unlisted incoming dependencies still require review.

Keep tests for the checker itself, including deliberate invalid inputs. Do not weaken checks, automatically rehash evidence, or mark everything stale to make a failing pipeline green. A reviewer should inspect why a gate failed and whether the map or implementation needs correction.

## Adoption boundary

This is the app-bootstrap and relevant-change contract, plus scoped enforcement for the registered map. It is not a retroactive rewrite of every existing app, a second task tracker, or automatic fleet-wide rollout. Expand coverage only when a scoped app/change warrants it. No generated inventory should imply complete repository coverage.
