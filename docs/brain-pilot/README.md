# Repo-brain pilot: evidence before rollout

**Question:** can a small, versioned change-impact map help a fresh agent find implementation, preserve invariants, and recognize what the repository cannot prove?

This pilot evaluates one narrow slice of `agent-apps`: preview routing and its immediate game/app/Kanban consumers. It is not an application rewrite, a security audit, or a claim that more documentation is always better.

## Result

**Baseline 8/8; map reader 8/8; both used 12 repository calls.** The separate stale-card challenge passed. No efficiency or correctness improvement was demonstrated. [Read the full results, controls, raw answers and limitations](results.md).

## Evidence trail

- [Repo map](../brain/index.md): task router, request flow, immediate consumers and capability boundaries.
- [Protocol](../plans/2026-09-24-repo-brain-pilot.md): questions and scoring committed before map creation.
- [Local verification receipt](verification.txt): nine existing preview workflow tests passed using isolated fixture services.
- Source baseline: `a3da91f69d24c14f6612b2a1fcdae7d2abb4f1b4`.
- Protocol commit: `3a4ff139de92230edf8ead9b508709cb2e7ae6dc`.

## Engineering decisions

- Keep implementation knowledge in the code repository so branches and reviews carry it together.
- Add a small router and evidence-backed cards, not a second copy of the README or API reference.
- Separate implemented behavior, checked source revision, and observed runtime state.
- Distinguish a health response from deployment provenance and backend readiness.
- Evaluate existing docs before claiming the new map improves anything.
- Publish limitations and raw answers, not only a success summary.

The root README still defines the review workflow. This branch is a proposal for human review; no production services, write permissions or automatic dispatch settings are changed. Broad rollout and CI enforcement are separate decisions.

## Reproduce the local regression check

```sh
npm ci
CI=true KANBAN_MODE=fixture KANBAN_READONLY=true PLAYWRIGHT_PREVIEW_PORT=4387 \
  npx playwright test tests/preview-workflow.spec.mjs --workers=1 --reporter=list
```

Use a checkout with the lockfile and compatible Playwright Chromium already installed (`npx playwright install chromium` if needed). Choose an unused main preview port; the existing suite also uses fixture ports 4195–4198. These are local tests, not verification of a deployed instance or GitLab CI status.

## Attribution

The map approach was informed by [RinDig/icm-architect](https://github.com/RinDig/icm-architect/tree/e16cafe6a664dcf6d787a726b452adba77d913f4), particularly its system maps and reference-integrity approach. The pilot's prose and evaluation are independently authored; source revision, explicit unknowns and adversarial stale-document checks are deliberate requirements.
