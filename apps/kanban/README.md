# Hermes Kanban operator app

Web app for viewing and operating the local Hermes Kanban board through the `agent-apps` app-preview service.

## Route

```text
/apps/kanban/
```

## Game Dev view

Deep link: `/apps/kanban/?view=game-dev` (add `&board=<existing-board-slug>` to target another board). The visible General / Game Dev links retain the selected board. General includes all original cards (including game tasks), subject only to its ordinary filters.

Game Dev reads `/api/kanban/games`, displays the selected game's Play build, available screenshot/video references, test command, and manual checklist. Missing media is explicitly unavailable; links and commands are not evidence of passing tests. Catalog failure disables game creation, with Refresh board as retry. Board and catalog generations discard stale replies when switching boards/views.

Game cards are filtered using `game_dev.game_id`, exact milestone, and discipline. Reset filters clears milestone/discipline and ordinary filters. Card clicks reuse the existing assignment/manage drawer and execution safeguards. Hermes statuses remain authoritative: `review` is not human playtest approval. There is no automatic card creation, movement, or migration.

In Game Dev, **Create game task** intentionally adds `{game_id, milestone, discipline}` to the existing create payload, using the selected catalog game. In General the optional metadata is omitted. Feature, bug, polish, performance, and playtest templates append actionable acceptance criteria only when **Append template** is clicked; changing template selection never edits a draft. Body length limits are checked before appending.

Focused UI verification (fixture server and mocked write responses, no live writes):

```sh
CI=true KANBAN_MODE=fixture PLAYWRIGHT_PREVIEW_PORT=4313 npx playwright test \
  tests/kanban-game-dev.spec.mjs tests/kanban-refresh.spec.mjs tests/kanban-board.spec.mjs \
  --workers=2 --output=/tmp/game-dev-ui-tests --reporter=list
```

## Write posture

The persistent app-preview service is approved for operator writes and runs with:

```text
KANBAN_READONLY=false
KANBAN_WRITE_AUTHOR=app-preview
```

Enabled write actions:

- create new cards in `triage` or direct `todo`
- create boards
- add comments
- assign/unassign cards
- block/unblock cards
- complete cards
- archive cards
- reassign/reclaim, edit completion result/summary/metadata, and link/unlink dependencies

Operator UX affordances:

- bridge-provided board summary counts (`total`, `active`, `by_status`, `by_assignee`, `by_tenant`)
- header summary cards for total, active, triage, and blocked counts
- board-first layout, with card creation and execution controls below the task board
- client-side search plus assignee, tenant, and status filters, with a reset button
- review, scheduled, and otherwise unknown statuses preserved as columns rather than dropped
- manual refresh with visible loading, last-success, and failure states; stale cards are removed immediately and writes are disabled while loading or after failure
- board/generation guards prevent stale reads and POST completions from replacing a newer selection, resetting drafts, or reopening another drawer; cards and drawer requests retain their owning board
- board selector plus create-board form via constrained `/api/kanban/boards`
- real assignee roster from `/api/kanban/assignees` used in filters and create form suggestions
- project operator roster from `apps/kanban/operator-roster.json` merged with live Hermes profiles/board assignees so empty boards still show Merquery, DrClawBotNik, Kodor, Critic, and helper agents
- tenant suggestions from live cards plus the operator roster, used in filters and create-card suggestions
- full create-card payload fields: triage/direct creation, workspace, parent IDs, forced skills, max runtime, and idempotency key
- high-friction execution panel backed by `/api/kanban/execution/status`, `/api/kanban/execution/dispatch`, and `/api/kanban/tasks/:id/claim`
- dispatch requires typing `DISPATCH`; claim requires typing `CLAIM`; both remain disabled unless the bridge is writable and `KANBAN_EXECUTION_ENABLED=true`
- task drawer details and comments/events from the show endpoint; runs, log, context, and diagnostics fetched lazily when their tabs are selected, with visible errors and retry
- task drawer operator forms for comments, assignment, completion metadata, block/unblock, archive, reassign/reclaim, edit completed result, and dependency link/unlink

Still intentionally absent:

- board-groomer cron
- automatic movement to `ready`
- direct exposure of Hermes dashboard/plugin APIs

The bridge lives at `/api/kanban/*` and must stay constrained. Do not expose the built-in Hermes dashboard plugin API directly on a network-accessible surface.

## Read-side boundary

Board task listings use `scripts/kanban-readonly.py` (execution summary counts try CLI `stats` first and use this reader as a fallback): a stdlib SQLite snapshot opened with `mode=ro` and `query_only`, without invoking `kanban list`, initializing/migrating the schema, or calling `recompute_ready`. Listings retain non-archived statuses and enrich cards with comment counts, dependency counts, and the latest nonempty run summary. The reader honors `HERMES_KANBAN_DB`, `HERMES_KANBAN_HOME`, and the shared root derived from `HERMES_HOME`.

**Schema-init caveat:** other CLI-backed reads (such as board discovery and task details) still use Hermes CLI commands, which may initialize or migrate their schema. This is not a guarantee that every GET is filesystem-write-free. The bounded guarantee is no implicit task-readiness promotion through board listing/summary reads; intentional operator writes remain available. Missing databases, incompatible schemas, and live CLI failures surface as errors, never silently substitute fixture cards.

CI stays fixture-mode and does not touch the live Hermes DB. Fixture mode advertises read-only/write-disabled and execution-disabled capabilities regardless of operator flags; write attempts return `423`. Browser write-flow tests use intercepted responses, and bridge tests use temporary databases/mock CLI executables.

## Focused verification

```sh
CI=true KANBAN_MODE=fixture PLAYWRIGHT_PREVIEW_PORT=4297 npx playwright test \
  tests/kanban-refresh.spec.mjs tests/kanban-board.spec.mjs tests/preview-workflow.spec.mjs \
  --workers=1 --output=/tmp/kanban-refresh-final-builder --reporter=list
```
