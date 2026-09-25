# Repo-brain default-workflow trial

Status: **active**, operator-authorized. Window: **2026-09-25 through 2026-10-22 UTC**, closes **2026-10-23 UTC** (four weeks). Scope: `agent-apps` only. No automatic extension or rollout to other repositories.

## Default for substantive work

For every feature, bug fix or refactor, begin with README and the applicable [repo brain](brain/index.md), then verify claims against source. Before implementation, record affected components, incoming consumers, required tests and uncertainties in the plan or MR. Code is authoritative; maps are scoped guidance, not certification.

During implementation record useful discoveries, wrong or missing claims and uncovered areas. In the same MR, semantically review and update affected cards and evidence, or mark them visibly stale with a reason. Never refresh fingerprints as a substitute for review. New apps/material architecture changes follow the [bootstrap contract](repo-brain-bootstrap.md); do not map the entire repository speculatively.

Run `uv run --frozen python scripts/check_repo_brain.py` and appropriate application tests. Mechanical success does not prove semantic accuracy, deployment identity or safety. Existing human review and deployment gates remain unchanged.

Copy-only and dependency-only changes may record `No mapped behavior affected` with a short reason. Unmapped substantive work records a coverage gap and follows the bootstrap contract where applicable; do not claim coverage that does not exist.

## MR evidence

Use the repository's Repo-Brain Trial template. Record:
- Pre-change impact prediction and source verification.
- Useful map discoveries, incorrect claims and missed consumers/tests (none is a valid answer).
- Coverage gaps and maintenance decision; links to changed/stale cards.
- Commands/results, reviewer-required corrections and CI false alarms.
- Maintenance time only when measured; otherwise unknown. Do not infer tokens or time from call counts.

Where practical, an independent reviewer inspects source before the author's impact note to reduce anchoring. This is not guaranteed blinding.

## Review cadence and exit

Review evidence weekly on 2026-10-02, 2026-10-09 and 2026-10-16 UTC; final review on 2026-10-23 UTC. Target at least ten substantive changes, not a quota to manufacture work. If fewer land, report limited exposure; do not silently extend the trial.

Each review enumerates included MRs, actual useful discoveries/misses, maintenance burden, false alarms and reviewer corrections. Compare against the controlled change evaluation without claiming one pair or observational usage establishes productivity gains. Store dated reviews under `docs/brain-trial/` as they occur; no fabricated empty success reports.

Final operator decision: keep, simplify, expand or stop. The temporary default expires at the closing date unless explicitly renewed; permanent bootstrap and mechanical CI requirements remain. Do not automatically remove existing maps or CI. No scheduled review implies automatic permission to change policy or deploy applications.
