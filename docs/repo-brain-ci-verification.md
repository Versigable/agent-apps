# Repo-brain workflow/CI verification

Implementation base: `b008d67a31f50f6747f4426a454e13c6ea199800`.

## Executed locally

- `uv run --frozen python scripts/check_repo_brain.py` — pass with the pinned Markdown parser.
- `uv run --frozen pytest tests/test_repo_brain.py -q` — 110 passed after parser replacement (initially 38).
- `uv run --frozen pytest -q` — 139 passed after parser replacement (initially 67).
- `uv lock --check --offline` — pass. `markdown-it-py==4.2.0` is a developer dependency, with `mdurl==0.1.2` locked transitively; application runtime dependencies remain unchanged.
- `CI=true KANBAN_MODE=fixture KANBAN_READONLY=true PLAYWRIGHT_PREVIEW_PORT=4388 npx playwright test tests/preview-workflow.spec.mjs --workers=1 --reporter=list` after `npm ci` — 9 passed.
- Parent compared all mapped Markdown/manifest/inventory bytes before and after default check: unchanged. Explicit regeneration was byte-idempotent and preserved evidence metadata.
- Runtime app/game/preview/bridge/deploy/package/config diff against implementation base: empty. CI change is limited to the new bounded mechanical job.
- `git diff --check` — pass.

Builder recorded RED→GREEN cycles for metadata, evidence drift/stale warnings, contained paths, links, inventory integrity and page validation. Isolated negative fixtures establish rejection, not just successful execution against the current docs.

## Review and interpretation

Bootstrap documentation passed independent review; suggested direct schema/reference links were added. Independent checker spec/quality review approved the parser replacement within its documented scope: 31 additional isolated CLI checks passed, including HTML/code precedence, escaped-angle parity, reference links, containment, evidence drift, stale warnings and inventory integrity. Operator approval to proceed was received; no separate human code review is claimed.

These are local results, not a GitLab pipeline receipt. The CI job is versioned but is not claimed to have executed remotely. Link/hash/inventory validation does not establish semantic accuracy or runtime identity. Three declared map pages are covered, not every document or consumer in the repository.
