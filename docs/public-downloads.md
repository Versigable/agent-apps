# Public immutable ZIP downloads

**Status:** source implementation and synthetic tests; not proof of deployed downloads. Parent/operator owns activation and genuine artifact approval. Existing publisher ZIP validation is unchanged. No game/native build is created by this feature.

## Read path and boundaries

- `scripts/playable-service.mjs` accepts only GET/HEAD. Exact `/downloads/{game}/{version}/{platform}.zip` routes resolve records in the reviewed release registry, never URL-supplied paths. Query strings, encoded aliases, `latest`, directory listing and range/resume are not implemented. Range headers are ignored: a normal complete 200 response is returned.
- `scripts/playable-downloads.mjs` is a builtins-only reader. No operator/store adapter, subprocess, credentials, environment store discovery or publisher execution is reachable. Selected records are cloned at server creation. Changes require a new release/process.
- `scripts/export-playable-downloads.mjs` is an **offline, read-only source-store export** tool. It copies only explicit publisher receipts and matching ZIPs to a new directory. It is not installed in the service release and does not publish or revalidate ZIP member semantics: it relies on operator-selected authentic receipts from the unchanged approved publisher, checking the full metadata record, size and SHA-256 against pinned bytes. A forged receipt plus matching arbitrary bytes is not proof of publisher provenance. Protect the receipt/store selection boundary.
- `scripts/stage-playable.mjs` requires the deliberate export's `records.json` to match registry downloads exactly (including order). Passing the original private store without that manifest fails. ZIPs go in release `downloads/`, not `public/`; metadata/manifests have no HTTP routes.

The original private artifact store remains inaccessible to the public UID. Export and release must be installed outside `/home`, private stores, repositories and brains, under root-controlled `/srv/agent-playable/`. Do not grant the service access to the original store or copy a broad private root. Local fixture paths are not deployment instructions.

## Registry contract

The existing game/runtime registry gains optional `downloads: []`. No default production receipt is seeded. Each entry has exactly the approved publisher fields:

```json
{"game":"example","version":"1.2.3","platform":"linux-x64","date":"2026-01-01T00:00:00+00:00","size":12345,"notes":"Illustrative schema, NOT a published release","sha256":"0000000000000000000000000000000000000000000000000000000000000000"}
```

Use genuine publisher output, not this illustrative record. Game/platform are routable ASCII slugs up to 64 characters; version follows publisher slug/dot rules up to 80; `--` is reserved. Notes have the publisher's 4000-code-point and complete-record 16384-byte limits. Duplicate identities, unknown fields, invalid dates, non-integer sizes and malformed hashes reject configuration. ZIP limit remains 2 GiB.

## Offline preparation (owner-only; does not activate)

From the repository, with explicit operator-selected receipt JSON **array**, existing publisher store and fresh destinations:

```sh
node scripts/export-playable-downloads.mjs "$PRIVATE_STORE" "$SELECTED_RECEIPTS_JSON" "$PUBLIC_EXPORT"
node scripts/stage-playable.mjs "$REPO_ROOT" "$REVIEWED_REGISTRY_JSON" "$NEW_RELEASE" "$THREE_BUILD_ROOT" "$PUBLIC_EXPORT"
```

Both tools refuse an existing destination. They remove partial new outputs on validation failure. Destination parents must be trusted and free of untrusted concurrent writers. Source files must be regular, single-link, non-writable files, with no symlink in any ancestor. The selected root/subdirectories must not be group/world writable. Fresh export directories remain owner-only until reviewed; **this is not a ready-to-run deployment**.

Before activation, the owner must root-own the complete release and its ancestors, seal directories read/execute and files read-only for the distinct `agent-playable` UID, and verify the UID cannot write/replace bytes or read private roots. Do not execute broad recursive ownership changes outside the selected release. The template keeps `/home /root /run/user /opt @ARTIFACT_STORE@` inaccessible, plus `ProtectSystem=strict`; the latter alone does not hide private data. `PLAYABLE_DOWNLOAD_ROOT` names only the release's `downloads` directory. Keep existing bind/port and scoped editing disabled. No service/config/deployment changes are performed by these scripts.

## HTTP and integrity behavior

Successful GET/HEAD uses `application/zip`, exact content length, safe ASCII attachment filename, `X-Content-Type-Options: nosniff`, digest ETag and `Cache-Control: private, max-age=31536000, immutable`. HEAD verifies the whole digest but emits no body. There is no CORS header or operator API.

Every request opens all components fd-relatively with no-follow; directories, FIFOs, symlinks and hardlinks fail. Hashing uses 64 KiB chunks, then streaming uses the **same pinned fd** and bounded end offset. Size and nanosecond stat identity are checked before/after hashing. Streaming does not use the static server's 32 MiB buffer. Corruption/missing files return generic 404 before success headers; failures after headers destroy the response rather than leaking an exception. Other methods return 405 with `Allow: GET, HEAD`.

Cancellation is installed before opening/verifying a download. Premature response or socket closure aborts both the hash stream and transfer pipeline, including GET/HEAD disconnects before headers. Already-disconnected requests do not start verification; cancellation during asynchronous open closes the acquired descriptor without hashing. Normal incoming GET completion is **not** an abort. Each exit removes the request's cancellation listeners and closes its pinned descriptor; no response is attempted on an already-destroyed response. A bounded in-flight read may complete, but disconnected requests do not retain full-archive hash work. This does not replace ingress capacity controls.

This is protection against path substitution, not a promise against a privileged writer modifying an open inode after hashing. Root-owned read-only release isolation is mandatory. A trusted root attacker can replace both data and registry. Each request hashes up to 2 GiB; ingress concurrency/rate limits and capacity are owner deployment concerns. No digest cache, on-disk writes, range support or latest-alias mutation is added.

## Verification and remaining gates

```sh
node --test tests/public-downloads.node.mjs tests/playable-static.node.mjs tests/playable-stage.node.mjs tests/playable-contract.node.mjs tests/game-build-store.node.mjs
```

Requires Linux `/proc`, Node, Python 3, `mkfifo`, publisher-suite `unzip`, and Playwright Chromium for the real browser asset regression. Download tests bind ephemeral loopback ports, create clearly synthetic isolated ZIPs larger than 32 MiB, run the real publisher, export, stage, load the staged server module, fetch and compare SHA-256/size. They do not publish production artifacts. Existing publisher tests cover malicious ZIP member/header semantics; this feature does not weaken them.

Troubleshooting: generic 404 means unknown exact route, absent download-root config, unsafe file/permissions, size mismatch or hash mismatch. Inspect offline records and controlled files, never relax isolation to diagnose. Invalid registry stops the CLI with a generic configuration error. An export failure requires reviewing selected receipts and re-running to a new destination, not hand-editing immutable identities.

`npm run test:playable-static` explicitly includes `tests/public-downloads.node.mjs` and is already invoked by the GitLab browser job with Python/unzip prerequisites. The [canonical navigation map](brain/index.md#public-zip-cancellation-and-ci--scoped-source-inspection) records the scoped source/consumer inspection; unrelated stale evidence is not refreshed. Cancellation regressions gate real stream reads until actual HTTP response closure, repeat GET/HEAD pre-header aborts and assert bounded work, FD and listener cleanup; transfer abort and normal staged GET/HEAD are also covered.

Independent source review, genuine artifact content/licensing review, owner deployment, service-UID/mount-namespace isolation checks and **public-origin GET digest matching the authentic publisher record** remain required. A synthetic local roundtrip does not close MR !113's public download gate.
