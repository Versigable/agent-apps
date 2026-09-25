# Repo-brain mechanical checks

Run from the repository root (Python 3.11+, uv-managed dev dependencies):

```sh
uv run --frozen python scripts/check_repo_brain.py
uv run --frozen pytest tests/test_repo_brain.py -q
```

The default command is read-only and exits nonzero on the first actionable
failure. The checker itself does not contact the network, invoke Git, start services, or certify
semantic correctness, runtime state, ownership approval, or complete coverage.
The GitLab `repo-brain-checks` job runs these commands with a five-minute timeout;
the existing Python and browser jobs are unchanged.

Markdown recognition uses `markdown-it-py==4.2.0` (CommonMark preset); raw HTML
attributes use Python's `html.parser.HTMLParser`. The parser is a dev/tooling-only
dependency, not an application dependency. It was resolved and explicitly pinned
with `uv add --dev --bounds exact markdown-it-py`; `uv.lock` also locks `mdurl`.
`uv run --frozen` may download locked dependencies to prepare an environment;
the checker never fetches link targets. After provisioning, use `uv run --offline
--frozen python scripts/check_repo_brain.py` to prohibit uv network access too.

## Manifest schema (version 1)

[manifest.json](manifest.json) is the editable authority. It contains
`{"schema_version": 1, "pages": [...]}` with a nonempty, explicit page list.
Each page requires:

| Field | Constraint |
| --- | --- |
| `path` | Existing repository-relative Markdown file; unique page path |
| `source_revision` | Full 40- or 64-digit hexadecimal Git revision, not an abbreviated ID |
| `verified_on` | Real calendar date, exactly `YYYY-MM-DD` |
| `owner` | Nonempty string; `unknown` is explicitly acceptable |
| `status` | `verified` or `stale` |
| `evidence` | Nonempty array of `{ "path": "...", "sha256": "..." }`; existing repository-relative files and 64 lowercase hexadecimal digest characters |
| `stale_reason` | Required, nonempty string when status is `stale` |

A verified card fails if any declared source content differs from its SHA-256.
To defer semantic reinspection, retain the old evidence hashes/revision/date,
set `status` to `stale`, explain `stale_reason`, and add this exact, visible line
to the card, replacing the reason with the manifest value:

```md
> STALE: Source changed; semantic review pending.
```

Warnings hidden inside comments or fenced/indented examples do not qualify.
Stale cards print a warning on every check. Staleness permits hash drift only:
missing files, metadata errors and broken links still fail. Remove the warning
and promote to verified only after actual semantic review, updating the evidence
metadata deliberately. A mechanically unchanged hash is not a semantic review.

## Inventory provenance and regeneration

[inventory.json](inventory.json) is a deterministic generated view, not an
independent certification. Its inputs are the exact bytes of `manifest.json`
and each mapped Markdown page. It records the manifest SHA-256, page content
SHA-256, declared evidence metadata, schema version and generator path. Pages
are sorted by path; JSON uses sorted keys, two-space indentation and a terminal
newline. There are no timestamps, absolute paths, Git-history dependencies or
machine-specific values. Declared evidence hashes are copied, never refreshed
from current source content by the generator.

After reviewing changes, explicitly regenerate and check:

```sh
uv run --frozen python scripts/check_repo_brain.py --write-inventory
uv run --frozen python scripts/check_repo_brain.py
```

Generation first validates the same metadata, links and evidence policy. It
writes only `docs/brain/inventory.json`; it never changes card text, source
revisions, verification dates, owners or evidence hashes. Missing, stale or
byte-tampered inventory fails the default command. Inventory symlinks/hardlinks
are rejected to prevent overwriting another file. `--root PATH` selects an
isolated repository root for fixture testing; normally omit it.

## Scope and limits

Only the three pages explicitly listed in the manifest are link-linted.
Linked targets are checked for existence and anchors, but their outbound links
are not recursively linted. Historical pilot answers remain historical receipts,
not new lint targets. The initial hashes were compared byte-for-byte with source
revision `a3da91f69d24c14f6612b2a1fcdae7d2abb4f1b4`; the existing static review dates
and ownership unknowns were retained, not upgraded by running this checker.

The declared evidence covers the mapped implementation, entry scripts, selected
tests, launcher consumers and service templates. README, CI and pilot links are
navigation/context references checked for link integrity, not declared semantic
hash evidence. New evidence or map coverage must be selected by a reviewer;
the checker cannot discover omitted relationships.

Markdown links/images, reference resolution (full, collapsed and shortcut),
ATX/setext headings, escapes, code spans, fenced/indented code and raw HTML
precedence follow the pinned CommonMark parser's tokens, not recognition regexes.
Nested labels, balanced URL parentheses and multiline Markdown are supported.
Only rendered link/image destinations are checked: unresolved references are
literal text and unused reference definitions do not create links. Reference
labels use the parser's case/whitespace normalization. Definitions cannot interrupt
an existing paragraph. The former positive reference fixture added a separating
blank line for this reason; no prior negative anchor expectation was relaxed.

Actual `id`/`name` attributes from raw HTML tokens define explicit anchors
(quoted or unquoted, with HTML entity decoding). Backticks inside quoted HTML
attributes are literal HTML, not Markdown code spans. Attribute-like prose,
`data-id`, attribute values containing `id=`, escaped tags, and tags inside code
or comments do not define anchors. Raw HTML blocks are not reparsed as Markdown.
HTML `href`/`src` attributes are not link-linted; HTMLParser is not a browser DOM,
HTML5 validator, sanitizer or CSS/JavaScript visibility evaluator.

Heading text comes from inline tokens: formatting delimiters and HTML tags are
omitted, link labels/image alt text and inline code contribute text, and escapes
and entities follow CommonMark. Slugs lowercase that text, remove characters
other than Unicode word characters, hyphens and whitespace, then replace each
whitespace character with a hyphen. Repeated heading slugs use `-1`, `-2`, etc.
This intentionally preserves the gate's slug policy, not every GitLab/GitHub
renderer-specific slug extension or HTML/heading-ID collision convention.
Fragments and paths are percent-decoded. CommonMark is the declared dialect;
GitLab-specific extensions (such as custom heading IDs) are not enabled.
External URLs (including mail links) are skipped without network access.
Local targets must be files contained in the repository after symlink resolution;
relative `../` links are allowed only while remaining inside it. No deep Git
history is needed: revision format is checked, not object availability. This
makes the gate usable in shallow CI and exported fixture trees.
