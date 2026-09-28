# Versioned game ZIPs and staged Game Dev surface

## Implementation boundary

`/games/dev/` is a build/download dashboard on the game surface. It is **not a completed migration of the editable Game Dev board**. Existing app-host Game Dev, capture, evidence, management and execution remain unchanged; its navigation adds a Game builds link. The new page links back to those approved controls. No broad `/api/kanban` routes are exposed on the games surface.

Task reads are disabled by default. `GAME_DEV_READS_ENABLED=true` permits only the small read-only projection in `loadGameTasks` through `/api/game-dev/games/:game/tasks`. This is a deployment gate, **not authentication**. Do not enable it until the owner verifies operator-group access, direct-backend isolation and the same-origin trust of playable JavaScript. Reads use the existing board loader and server-selected board; no second task DB, web writes, uploads or execution endpoints exist here. Caller-selected boards are rejected. Management migration still requires a separately reviewed scoped write design and auth/origin decision.

## Publication and storage

Default reader store: `$HOME/.local/share/agent-game-builds`; override with `GAME_BUILD_STORE`. Nothing initializes this store during HTTP reads. Keep the store outside any repository, `brain`/`*-brain`, or `.hermes` directory. A deployment may set the reader and publisher to the same dedicated local volume; no service configuration is changed by this feature.

Local publish (run only for a real, reviewed artifact; placeholders below are not actual builds):

```sh
python3 scripts/publish-game-build.py \
  --store "$HOME/.local/share/agent-game-builds" \
  --game '<catalog-game-id>' --version '<immutable-version>' \
  --platform linux-x64 --zip /absolute/path/to/reviewed-build.zip \
  --notes 'Release notes and known limitations'
```

The publisher validates identifier segments and notes, copies to hidden staging, validates ZIP structure/member names/types/CRC and limits, computes SHA-256, writes metadata and atomically renames to `<game>--<version>--<platform>/`. Existing published identities cannot be overwritten. Files become read-only. A failed publication is not advertised. No archive extraction or execution occurs. The CLI validates syntax, not catalog membership; the HTTP API separately requires a registered game, so a typo cannot create a new public project.

Release notes are limited to **4,000 Unicode code points** (not UTF-16 code units); C0 controls other than newline/tab are rejected. The entire serialized `metadata.json`, including all identity/date/hash/size fields, must be **at most 16,384 UTF-8 bytes**. Publication uses UTF-8 JSON without ASCII escaping and checks this byte budget before the immutable rename. Thus even notes within the code-point limit may be rejected with long identities; rejection leaves no final identity and the version can be retried with shorter notes.

ZIP limits: 2 GiB compressed, 8 GiB total expanded, 20,000 entries, no empty archives, no encrypted or unsupported compression, no traversal, absolute/drive/backslash/dot paths, duplicate case-insensitive names, symlinks or special files. Original ZIP member names are checked before normalization: C0/C1 controls (including NUL and DEL) and any original/parsed-name discrepancy are rejected. Only a single terminal slash for a directory is stripped; ordinary local-header name agreement and CRC are checked by the ZIP reader. Extra fields in **both central-directory and local headers** must have complete type/length/value framing (no truncated headers, trailing bytes or payload overruns). **All Info-ZIP Unicode Path (`0x7075`) fields are rejected**, even safe/matching names, invalid CRCs, unknown versions, malformed payloads or duplicates: Python ignores these overrides while other readers may honor them. Rebuild affected archives using ordinary UTF-8 member names without Unicode Path extras. Ordinary Unicode filenames remain supported, as do well-framed standard metadata such as timestamps, Unix UID/GID and ZIP64 within the existing limits. This narrow override policy does not interpret every vendor-specific extra field or guarantee agreement across every ZIP reader. ZIP_STORED and DEFLATE supported. Expansion ratio above 1000 (with 1 MiB floor) is rejected. This is structural validation, **not malware scanning, secret detection, licensing review or native launch verification**. The publisher must inspect contents and release permissions before publication. Ordinary non-dot files can still contain secrets; do not publish unreviewed workspaces.

Storage assumes a trusted local owner. POSIX read-only modes and no-overwrite publication are application immutability, not WORM protection against root/store-owner tampering. Linux `/proc/self/fd` is required by the download reader. FD-relative directory traversal plus no-follow opens reject symlink ancestors, symlink files and hardlinked artifact files. Missing entries and entries with invalid metadata, file shape or file size are not listed. Listing does not hash archive content: same-size corruption can still appear in a listing. Downloads verify SHA-256 on the pinned file descriptor before sending headers or bytes, then stream the same descriptor with bounded memory. This adds one full disk read before each download; no range/resume support or automatic retention/deletion is implemented. Do not mutate published store files manually.

## API and identity

- `GET /api/game-dev/games`: existing merged catalog; no task bodies.
- `GET /api/game-dev/games/:game/builds`: immutable records with game/version/platform/date/size/notes/SHA-256 and exact `downloadUrl`.
- `GET|HEAD /api/game-dev/games/:game/builds/:version/:platform/download`: constrained ZIP attachment, `nosniff`, private immutable cache and hash ETag. No filesystem paths or arbitrary URLs are accepted.
- `/games/dev/?game=:game&version=:version&platform=:platform`: exact build UI link; missing build never silently substitutes another identity.
- `GET /api/game-dev/games/:game/tasks`: default denied, opt-in read-only scoped projection; no generic task detail/log/context endpoints.

No “latest” mutable alias, web upload, task capture or evidence write has been added. Exact native identity is displayed but not silently substituted into the existing browser playtest-capture schema. That integration is pending the operator migration.

Catalog integration uses existing native-project work in `scripts/kanban-games.mjs` and `apps/kanban/dev-projects.json`; those prerequisite edits were not authored by this lane. No Surfs Ahoy build exists or is seeded. Unpublished projects show **No published builds yet**. All test archives explicitly say fixture/not a production build.

## Verification

```sh
npm run test:build-downloads
KANBAN_MODE=fixture PLAYWRIGHT_PREVIEW_PORT=4391 npx playwright test tests/preview-workflow.spec.mjs tests/game-dev-discovery.spec.mjs tests/kanban-game-dev.spec.mjs tests/kanban-games-api.spec.mjs --workers=1
uv run --frozen python scripts/check_repo_brain.py
```

Node suites require Python 3 and Info-ZIP `unzip` for independent `unzip -Z1` name-listing checks; malicious fixtures are never extracted. They start ephemeral-port fixture servers, publish only temporary labeled fixtures and clean them up. Chromium must already be installed (`npx playwright install chromium`). Screenshots default to the test-owned temporary directory; set `GAME_BUILD_TEST_ARTIFACTS` to an owned output directory to retain them. This does not require a specific home directory. No native game or service is launched/restarted. Repo-brain affected cards are explicitly stale pending integrator semantic review; mechanical checks do not prove authorization or deployment.
