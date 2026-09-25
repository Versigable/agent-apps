# Repo-brain pilot: preview routing

## Scope and acceptance
Add an evidence-backed navigation map for preview routing and immediate consumers. No runtime changes, production operations, or fleet-wide brain/CI mandate. Existing README, source and tests remain authoritative. Source baseline: `a3da91f69d24c14f6612b2a1fcdae7d2abb4f1b4`.

Accept when the map is reachable from README, paths/symbols are checked, a focused fixture test passes, independent cold readers complete the questions, and results/limitations are published for review. A negative or inconclusive comparison is a valid pilot result.

## Preregistered questions (before map creation)
1. A user calls the landing page the "operator dock". Where is its root redirect selected, what makes it win over the arcade, and which files/tests would you inspect before changing that behavior?
2. We want the games-only preview to expose Kanban API requests. Trace the current gate and downstream consumer; identify first-order impact, verification, and an invariant that should not silently change.
3. Does a successful health probe prove a particular commit is deployed, that Kanban writes are enabled, or that no external service depends on the preview? Cite what the code actually establishes and name unknowns.
4. A reviewer says apps-only preview must serve `/__preview/manifest` because it is a generic preview URL. Determine actual behavior and locate an appropriate regression test.

Separate adversarial check after the clean comparison: give a fresh reader a disposable map copy with an explicitly old revision and false statement that apps-only serves the game manifest; ask for source verification. Do not merge that injected card.

## Comparison controls
- Two isolated readers; same baseline source, model inherited from parent, tools, questions and budget (at most 12 file-read/search/terminal calls). No services, network, writes, or tests by readers.
- Baseline: existing docs only. Treatment: existing docs plus the map and README route. Answers/expected evidence are not provided to readers.
- Record tool calls and concrete source citations; self-reported counts are not exact tokens. Do not use elapsed time as a speed benchmark.
- Score each question: source correctness (0/1), appropriate verification or explicit uncertainty (0/1). Report omissions and unsupported certainty separately. Review raw answers before assigning scores.
- One reader per arm is a feasibility check, not a statistically powered productivity benchmark. Prompt-visible tasks and a small surface can create ceiling effects. No causal speedup claim.

## Verification and maintenance
Validate required local Markdown targets and cited symbols against source; run a focused local Playwright fixture suite without touching deployed previews or real task stores. Record commands, counts, revision, and failures/recoveries in a results report. No GitLab pipeline result is inferred from local execution.

When a PR changes an interface, invariant, dependency, ownership or verification path, update the map in that PR or explicitly mark stale. Semantic review is required even when links resolve.

## Publication
GitLab branch/MR with protocol, map, raw reader answers and measured results. Existing mirror is downstream; inspect it before claiming public visibility. Human merge review remains intact. No internal brain material or credentials belong in this repo.
