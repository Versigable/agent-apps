# Public playable isolation — staged, not deployed

## Approved target and present limits

- `game-preview.ninjaprivacy.org` stays on **4173**, becomes **public without Authentik**, and must serve only this static process after owner cutover.
- `gamedev.ninjaprivacy.org` goes behind Authentik to the **existing 4175 operator process**. `app-preview` remains on that same process/store. No game-play origin, no operator privilege promotion of the existing player origin, and no clean-client promotion ceremony.
- Existing preview defaults, installers and user units are deliberately unchanged. The old combined preview process is **not safe to make public as a substitute**. Existing build-dashboard and task-read code is not installed in the player release.
- Firewall restriction to local host, Traefik `10.0.2.5` and Eric's workstation is owner-reported. Parent reports health 200 on local loopback/LAN/Tailscale addresses at both ports; remote timeout is owner-reported only. None proves OS separation, correct role or operator authorization. Do not rebind listeners or change firewall here.

## Source and routing contract

[`playable-service.mjs`](../scripts/playable-service.mjs) imports Node builtins only; no Kanban, operator, publisher, subprocess, task DB or artifact-store module. [`playable-registry.json`](../deploy/playable-registry.json) explicitly enumerates reviewed game files and the required Three.js module/core runtime. Adding a game or asset requires reviewing this registry and testing its browser requests. Registration is not a secret/license/content audit: a registered JS file is intentionally public.

GET/HEAD only. `/healthz` contains no filesystem paths; `/` redirects to a generated escaped `/games/arcade/` launcher; game directory URLs canonicalize to slash. No existing arcade JS/manifest/artifact directory is exposed. Files outside the exact registry, `/games/dev`, all task/build/native APIs, apps, repo metadata and private paths get generic 404. Other methods get generic 405. No CORS grant; no operator link or token is delivered to games. Query strings do not select files. Encoded/noncanonical aliases are not decoded into allowed paths. Errors never include local paths or exception text.

Linux `/proc/self/fd` no-follow component opens (including ancestors) reject symlinks and nonregular/hardlinked files. Individual assets are capped at 32 MiB. Staged releases must be root-owned and immutable to the service account; route containment does not replace this OS boundary. Files are buffered, so load/rate limits and future large assets need separate review. No request-time source compilation or execution occurs. There is no range serving, native download or evidence/media API here.

## Offline staging (not installation)

Run as a build user against a reviewed checkout; **never export the whole repo**. Choose a new nonexisting destination; export failures remove that owned partial directory. Its parent must be build-user-owned and not attacker-writable. The exporter copies only registry assets, the reviewed registry and the standalone server, without links, operator modules or dependencies. The `node_modules` symlink in this worktree is an inherited local setup artifact and must not be installed.

```sh
node scripts/stage-playable.mjs /absolute/reviewed/checkout \
  /absolute/reviewed/checkout/deploy/playable-registry.json \
  /absolute/owned/staging/new-release \
  /absolute/real/node_modules/three/build
```

The last argument is an explicit trusted real runtime directory (not a symlink). Omit it only when the checkout dependency path has no symlink components. Review resulting names, sizes and SHA-256s; retain source revision plus dirty-overlay provenance until human integration. Do not claim a dirty checkout is a merged release.

## Owner-only activation runbook — no steps executed by this package

1. Obtain independent boundary review and human merge. Keep app-preview management available. Resolve Node executable to a system-owned path outside `/home`; validate its version with the tests. Create a dedicated **system** `agent-playable` user/group, nologin, no home, no supplementary operator groups, no sudo, SSH keys, credentials or Hermes environment. Do not reuse `merquery` or its user service.
2. Install the reviewed staging result as a **real directory**, not a symlink, `/srv/agent-playable/releases/<revision>/`, owned root:root. Directory modes 0755 and file modes 0644; service UID cannot change files or ancestors. This is the only public release, outside merquery's home. Do not make `/home/merquery`, its Hermes DB, or native artifact store readable to solve an asset failure.
3. Render [`agent-playable.service.in`](../deploy/systemd/agent-playable.service.in) to an owner-reviewed system unit. Substitute `@NODE@` (system executable), `@RELEASE@`, `@EXISTING_BIND@` (the inspected existing bind address, **not a listener change**) and `@ARTIFACT_STORE@` (actual native store absolute path). Add every resolved external Hermes DB/state directory to `InaccessiblePaths` if outside `/home`; verify CLI/store symlink targets privately without recording secrets. Do not use a '-' optional prefix for required private paths. No unresolved placeholder may remain. Template has no read/write path grants and masks home/run-user/store in addition to Unix user isolation.
4. Run `systemd-analyze verify` on the rendered unit. Inspect systemd version/support and `/proc/self/fd` availability inside its sandbox. Confirm `ProtectHome`, `ProtectSystem`, path masks and account permissions are effective, not merely accepted text. Capture negative reads **as the actual UID and inside the service mount namespace** for the real task DB, home and artifact store, plus inability to write the release. Check the account has no supplementary privilege. These are mandatory pending deployment receipts; fixtures do not prove them.
5. Coordinate stopping the old **4173-only** user service and starting exactly one system service at the same bind/port. Do not touch 4175 or rebind/firewall rules. Keep public ingress disabled until the installed process command/user/role and deny matrix are verified. Health alone is insufficient. Read back `/games/arcade/`, each game and runtime, GET/HEAD, forbidden APIs/dev/private paths, methods and canonicalization. Record release digests and game browser compatibility. Then owner removes Authentik only for the reviewed public player route. Never remove authentication from either operator origin.
6. Verify anonymous public play, owner direct-backend restrictions from appropriate network positions and Authentik authorized/nonoperator/anonymous behavior on both operator origins. Inspect host-only operator cookies and same-site CSRF defenses before gamedev writes activate. Sibling origins are same-site: lack of CORS does not stop credentialed side effects.

Rollback: stop public exposure before reverting to the old broad preview process, or retain the reviewed static process/release while disabling gamedev. Never expose the old combined operator-capable service publicly. No DB copy, restore or history rewrite belongs to frontend rollback.

## Local evidence and remaining migration

`npm run test:playable-static` uses isolated temp roots/ephemeral loopback ports, adversarial fixture requests and real staged browser assets. `npm run test:build-downloads` retains publisher/reader coverage. Existing tests remain unchanged. CI invokes both after browser setup with explicit `python3`/`unzip` installation in the existing Ubuntu Noble Playwright image. Local host availability is not proof that remote CI executed or that image package installation succeeded.

Follow [the remaining editable operator implementation plan](game-dev-operator-migration.md). This static package does **not** deliver editable Game Dev, host routing, authentication or deployed OS isolation. The old app-host Game Dev stays functional until the full migration meets acceptance.
