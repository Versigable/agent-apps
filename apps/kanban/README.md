# Hermes Kanban operator app

Web app for viewing and operating the local Hermes Kanban board through the `agent-apps` app-preview service.

## Route

```text
/apps/kanban/
```

## Write posture

The persistent app-preview service is approved for operator writes and runs with:

```text
KANBAN_READONLY=false
KANBAN_WRITE_AUTHOR=app-preview
```

Enabled write actions:

- create new cards in `triage`
- add comments
- assign/unassign cards
- block/unblock cards
- complete cards
- archive cards

Operator UX affordances:

- bridge-provided board summary counts (`total`, `active`, `by_status`, `by_assignee`, `by_tenant`)
- header summary cards for total, active, triage, and blocked counts
- client-side search plus assignee, tenant, and status filters
- manual refresh with visible last-refresh status
- board selector plus create-board form via constrained `/api/kanban/boards`
- real assignee roster from `/api/kanban/assignees` used in filters and create form suggestions
- full create-card payload fields: triage/direct creation, workspace, parent IDs, forced skills, max runtime, and idempotency key
- task drawer tabs for details, comments/events, runs, log, context, and diagnostics
- task drawer operator forms for comments, assignment, completion metadata, block/unblock, archive, reassign/reclaim, edit completed result, and dependency link/unlink

Still intentionally absent:

- dispatcher button
- board-groomer cron
- automatic movement to `ready`
- profile execution controls
- direct exposure of Hermes dashboard/plugin APIs

The bridge lives at `/api/kanban/*` and must stay constrained. Do not expose the built-in Hermes dashboard plugin API directly on a network-accessible surface.

CI stays fixture-mode and does not touch the live Hermes DB. Fixture-mode write attempts return `409` even when write UI mode is enabled for tests.
