# Results: useful map, no demonstrated efficiency gain

## Outcome

**Both readers scored 8/8 and used all 12 repository-tool calls.** The separate stale-card reader rejected the injected false behavior using source and test assertions. This small pilot demonstrates feasible source-grounded navigation and one successful stale-document challenge. It does **not** demonstrate improved correctness, fewer reads, faster work, lower token use, or safer implementation changes.

The map is ready for human review as a bounded documentation addition. Do not use this result to mandate repo brains across the fleet. A harder follow-up should cover a real multi-component change and measure maintenance cost.

## Scoring and inspectable answers

Two points per preregistered question: one for correct source identification/behavior and one for appropriate verification or explicit uncertainty. The parent evaluator inspected the complete answers against source and the preregistered questions. Scoring was not blinded.

| Question | Baseline | Map treatment | Evidence supporting score |
| --- | --- | --- | --- |
| Operator dock / root precedence | 2 | 2 | Both cite `handler`, apps-only conditional, combined-mode arcade priority, and missing explicit root-redirect coverage. |
| Games-only Kanban exposure | 2 | 2 | Both trace dispatcher gate to `handleKanbanRequest`, distinguish reachability from write/execution guards, and identify isolation/fixture regressions. |
| Health versus identity/capability/dependencies | 2 | 2 | Both reject deployment/capability/dependency conclusions from generic health, separate bridge health, and state inspection/runtime limits. |
| Apps-only manifest wrapper | 2 | 2 | Both identify 403 and the exact surface-separation regression; distinguish static app registry. |
| **Total** | **8/8** | **8/8** | No incorrect core answer or unsupported deployment-success assertion observed. |

Unedited answers are preserved as text so their original checkout-relative citations are not mistaken for links relative to this report:
- [Baseline answer](baseline-answer.txt)
- [Map treatment answer](treatment-answer.txt)
- [Stale challenge answer](stale-challenge-answer.txt)

Both health answers discuss outbound dependencies more fully than incoming external consumers. Neither inventories services depending on this preview, and neither proves their absence. This remains a coverage limitation, not an exhaustive dependency audit. The treatment explicitly flags launcher details relied on from the map where independent reading was incomplete; that disclosure matters.

## Observed tool usage

Counts independently parsed from reader tool transcripts, not inferred from orchestration API-call counts:

- Baseline: 6 reads, 5 searches, 1 terminal call = **12** repository calls. The terminal call attempted Git inspection and failed because the snapshot intentionally lacked `.git`.
- Treatment: 10 reads, 2 searches = **12** repository calls.
- Stale challenge: **3** reads.
- Each reader additionally loaded one required skill. Those skill loads are outside the preregistered repository-call budget.

Searches can return many files and reads can differ in size; these counts are not token measurements. Both readers reached the imposed budget, so the counts cannot establish the minimum work needed. Elapsed time and provider/API-call totals are not compared.

## Controls, deviations and limitations

- Protocol committed first at `3a4ff139de92230edf8ead9b508709cb2e7ae6dc`; implementation baseline `a3da91f69d24c14f6612b2a1fcdae7d2abb4f1b4`.
- Both readers received isolated archived snapshots with the same implementation, same repository-tool budget and inherited parent model configuration, with no network, service access, tests or writes. No model override was requested; independent provider-resolved model receipts were not collected.
- Parent byte comparison verified all **113** baseline files other than README unchanged in treatment. Treatment added three map files, the README route and a linked protocol; readers were instructed not to read the protocol, answer key or other outputs. Neither reports opening them.
- Treatment was explicitly directed to start at README; baseline was allowed normal navigation. This onboarding asymmetry prevents interpreting the run as a strict causal benchmark.
- Builder knew the questions. This is an in-sample feasibility evaluation, not a held-out generalization test.
- One reader per arm; no repeated trials, blinding, exact token/context measurements, actual code change, or longitudinal maintenance measurement. Good existing docs and a small scope plausibly created a ceiling effect; that is an interpretation, not a measured cause.
- Treatment's index was frozen before the final publication-only evidence-package link was added. Semantic map/source content is unchanged from the evaluated copy.
- Reader archive provenance was verified by the parent; readers could not independently verify Git identity from `.git`. Baseline's failed Git call is included rather than hidden.

Frozen treatment map SHA-256 values:

```text
5d39234f2afaca7acb2e9d1540154a33d90713b598b9f94fc8e19577152e5843  preview-routing.md
4208f6fcc8b5e77a4b37c9b64a0f694add0f151fe656053459d48700d2f2cabf  preview-consumers.md
07ce4bd664b3637b981b4a963cbbb2b568c0fd111d4a95a02ed6d7d266fad8ea  index.md
```

## Stale-card challenge

A disposable copy replaced the routing card's revision with all zeros, dated it 2020-01-01, and falsely claimed apps-only serves the game manifest wrapper. [Exact injected patch](stale-injection.patch). The contradictory correct test-summary sentence remained, making this an intentionally easy/salient challenge rather than a stealth drift benchmark.

The independent reader found the contradiction, preferred `servesGames`/`handler` and the existing test assertions, recommended correcting the card instead of changing code, and kept runtime claims unverified. The deliberately wrong card is **not** in the production map; only the labeled test patch is retained as evidence. The reader was explicitly asked to verify against source, so this does not measure spontaneous stale-document detection.

## Verification and publication boundaries

- [Local fixture regression receipt](verification.txt): **9/9 passed**, exit 0. No source, test, CI or deployment configuration changed from the implementation baseline.
- Original map validation: **34** local links/anchors resolved; parent rechecked them. The builder additionally reported 30 cited functions; the parent reviewed load-bearing dispatcher/health/capability claims against source rather than treating that count as semantic proof.
- Whitespace check initially flagged context-only blank lines inside the stored injection patch; regenerated it with zero context and the check passed. No runtime defect was involved.
- GitLab MR: [!4](https://gitlab.ninjaprivacy.org/agent-dev/agent-apps/-/merge_requests/4). Branch and MR head are verified via Git refs. Web UI requires authentication; remote CI status is **not verified**.
- GitHub mirror: [pilot branch](https://github.com/Versigable/agent-apps/tree/docs/repo-brain-pilot). This is a review branch, not a claim of merge or production deployment.

## Shareable takeaway

A reproducible agent workflow includes a versioned map, explicit trust boundaries, a preregistered evaluation, adversarial documentation checks and published negative results. Here the honest result is parity: the new map organized change-impact knowledge, but did not outperform existing documentation on this test. That is evidence for a bounded review—not a productivity multiplier claim.
