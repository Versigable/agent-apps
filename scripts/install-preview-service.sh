#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unit_src="$repo_root/deploy/systemd/user/agent-apps-preview.service"
unit_dst="$HOME/.config/systemd/user/agent-apps-preview.service"

if [[ -z "${XDG_RUNTIME_DIR:-}" && -d "/run/user/$(id -u)" ]]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi

mkdir -p "$(dirname "$unit_dst")"
cp "$unit_src" "$unit_dst"

if ! systemctl --user daemon-reload; then
  cat >&2 <<'ERROR'
Could not reach the per-user systemd bus from this shell.
Try again from an interactive login shell for the merquery user, or ensure linger/user-runtime is enabled.
The unit file was still copied into ~/.config/systemd/user/agent-apps-preview.service.
ERROR
  exit 1
fi

systemctl --user enable --now agent-apps-preview.service
systemctl --user status agent-apps-preview.service --no-pager
