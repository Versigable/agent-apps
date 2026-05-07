#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unit_src="$repo_root/deploy/systemd/user/agent-app-preview.service"
unit_dst="$HOME/.config/systemd/user/agent-app-preview.service"

if [[ -z "${XDG_RUNTIME_DIR:-}" && -d "/run/user/$(id -u)" ]]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" && -S "${XDG_RUNTIME_DIR:-}/bus" ]]; then
  export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"
fi

mkdir -p "$(dirname "$unit_dst")"
cp "$unit_src" "$unit_dst"

if ! systemctl --user daemon-reload; then
  cat >&2 <<'ERROR'
Could not reach the per-user systemd bus from this shell.
Try again from an interactive login shell for the merquery user, or ensure linger/user-runtime is enabled.
The unit file was still copied into ~/.config/systemd/user/agent-app-preview.service.
ERROR
  exit 1
fi

systemctl --user enable --now agent-app-preview.service
systemctl --user status agent-app-preview.service --no-pager