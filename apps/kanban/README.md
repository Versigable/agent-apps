# Hermes Kanban operator app

Read-safe web app for viewing the local Hermes Kanban board through the `agent-apps` preview service.

## Route

```text
/apps/kanban/
```

## Safety posture

M1 is intentionally read-only by default:

- no dispatcher button
- no board-groomer cron
- no automatic movement to `ready`
- no profile execution controls
- fixture-mode CI so tests do not touch the live Hermes DB

The bridge lives at `/api/kanban/*` and must stay constrained. Do not expose the built-in Hermes dashboard plugin API directly on a network-accessible surface.
