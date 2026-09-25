# Repo-brain workflow and CI adoption

## Authorization and baseline
The operator approved the remaining repo-brain steps after reviewing/merging the pilot: bootstrap requirements and mechanical drift checks. Baseline `b008d67a31f50f6747f4426a454e13c6ea199800`. Work on `feat/repo-brain-workflow-ci`; do not change production services or merge automatically.

## Acceptance
- Versioned app-bootstrap contract and README entry; reusable orchestration skill routes to it.
- Required machine-readable metadata: source revision, verification date, owner/unknown, evidence status, paths and source fingerprints.
- Default read-only checker detects missing/broken local map targets and anchors, malformed metadata, changed verified evidence, and stale/tampered generated inventory. No network or deep-history dependency.
- Explicit inventory generation is deterministic and never recertifies source hashes/dates. Explicit stale evidence needs reason and warning; human review still decides acceptability.
- Isolated negative tests demonstrate each gate actually rejects invalid inputs, including path escape; run full Python suite and relevant fixture checks.
- Dedicated bounded GitLab CI job preserves existing jobs. No changes to app behavior, public exposure, dispatch or deployment.
- Independent spec and quality reviews before final publication. Push new MR, verify branch/MR refs and public GitHub mirror; remote CI status is separate from local tests.

## Ownership
Builder: checker, tests, manifest/inventory, CI integration and checker reference. Parent: bootstrap contract, README route, workflow skill, integration verification and publication. Reviewers are read-only.

## Limits
Only declared map coverage is enforced. No automatic complete-repo graph or semantic correctness claim. The prior pilot demonstrated parity, not efficiency gains. Existing historical pilot reports remain immutable observations at their tested revision.
