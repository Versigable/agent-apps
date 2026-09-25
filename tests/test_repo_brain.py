"""Isolated CLI regressions; no test writes into the product checkout."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/check_repo_brain.py"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(root, manifest):
    (root / "docs/brain/manifest.json").write_text(json.dumps(manifest))


def run(root, *args):
    return subprocess.run([sys.executable, str(SCRIPT), "--root", str(root), *args],
                          text=True, capture_output=True)


@pytest.fixture
def repo(tmp_path):
    (tmp_path / "docs/brain").mkdir(parents=True)
    (tmp_path / "source.py").write_text("answer = 42\n")
    (tmp_path / "docs/brain/card.md").write_text("# Card\n\n[Source](../../source.py)\n")
    manifest = {"schema_version": 1, "pages": [{
        "path": "docs/brain/card.md", "source_revision": "a" * 40,
        "verified_on": "2026-09-24", "owner": "unknown", "status": "verified",
        "evidence": [{"path": "source.py", "sha256": digest(tmp_path / "source.py")}],
    }]}
    save(tmp_path, manifest)
    return tmp_path, manifest


@pytest.mark.parametrize("field,value", [
    ("owner", None), ("owner", ""), ("source_revision", "a3da91f"),
    ("source_revision", "z" * 40), ("verified_on", "2026-02-30"),
    ("verified_on", "20260924"), ("status", "draft"), ("evidence", []),
    ("evidence", [{"path": "source.py", "sha256": "abc"}]),
])
def test_invalid_metadata(repo, field, value):
    root, manifest = repo
    if value is None:
        del manifest["pages"][0][field]
    else:
        manifest["pages"][0][field] = value
    save(root, manifest)
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert field in result.stderr
    assert "Traceback" not in result.stderr


@pytest.mark.parametrize("data", ["{", "[]", '{"pages": [null]}', '{"schema_version": 1, "pages": [null]}'])
def test_malformed_manifest(repo, data):
    root, _ = repo
    (root / "docs/brain/manifest.json").write_text(data)
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "Traceback" not in result.stderr
    assert "manifest" in result.stderr


@pytest.mark.parametrize("kind", ["evidence", "page", "symlink", "manifest", "inventory"])
def test_path_escape(repo, kind):
    root, manifest = repo
    outside = root.parent / (root.name + "-outside")
    outside.write_text("outside")
    if kind in ("manifest", "inventory"):
        target = root / f"docs/brain/{kind}.json"
        target.unlink(missing_ok=True)
        target.symlink_to(outside)
    elif kind == "page":
        manifest["pages"][0]["path"] = str(outside)
        save(root, manifest)
    else:
        if kind == "symlink":
            (root / "escape").symlink_to(outside)
            path = "escape"
        else:
            path = "../" + outside.name
        manifest["pages"][0]["evidence"][0]["path"] = path
        save(root, manifest)
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "path" in result.stderr
    assert "Traceback" not in result.stderr
    assert outside.read_text() == "outside"


@pytest.mark.parametrize("stale,reason,warning,ok", [
    (False, False, False, False), (True, False, True, False),
    (True, True, False, False), (True, True, True, True),
])
def test_source_drift_and_stale_policy(repo, stale, reason, warning, ok):
    root, manifest = repo
    assert run(root, "--write-inventory").returncode == 0
    (root / "source.py").write_text("changed\n")
    page = manifest["pages"][0]
    if stale:
        page["status"] = "stale"
    if reason:
        page["stale_reason"] = "Source changed; semantic review pending."
    if warning:
        with (root / page["path"]).open("a") as f:
            f.write("\n> STALE: Source changed; semantic review pending.\n")
    save(root, manifest)
    before = (root / "docs/brain/manifest.json").read_bytes()
    result = run(root, "--write-inventory")
    assert (result.returncode == 0) is ok, result.stderr
    assert (root / "docs/brain/manifest.json").read_bytes() == before
    if ok:
        result = run(root)
        assert result.returncode == 0
        assert "STALE" in result.stderr
    else:
        assert "drift" in result.stderr or "stale" in result.stderr.lower()


def test_missing_evidence(repo):
    root, _ = repo
    (root / "source.py").unlink()
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "source.py" in result.stderr


@pytest.mark.parametrize("link", [
    "[bad](missing.md)", "[bad](#absent)", "[bad](other.md#absent)",
    "[bad](../../../outside.md)", "[bad](%2e%2e/%2e%2e/%2e%2e/outside.md)",
    "[bad][ref]\n\n[ref]: other.md#absent", "![image](missing.png)",
])
def test_broken_links(repo, link):
    root, _ = repo
    (root / "docs/brain/other.md").write_text("# Other\n")
    (root / "docs/brain/card.md").write_text("# Card\n" + link)
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "card.md" in result.stderr
    assert "Traceback" not in result.stderr


def test_valid_links_anchors_and_ignored_examples(repo):
    root, _ = repo
    (root / "docs/brain/other.md").write_text("# Hello `world`!\n# Hello `world`!\n<a id=\"manual\"></a>\n")
    (root / "docs/brain/card.md").write_text('''# Card
[local](#card) [heading](other.md#hello-world) [repeat](other.md#hello-world-1)
[explicit](other.md#manual) [ref][target] [external](https://example.invalid/nope)

[target]: other.md#hello-world
`[ignored](missing-inline.md)`
````md
[ignored](missing-fence.md)
````
<!-- [ignored](missing-comment.md) -->
''')
    result = run(root, "--write-inventory")
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("example", [
    'Use id="fake" in the configuration.',
    "Use name='fake' in the configuration.",
    '`<a id="fake"></a>`',
    "``<a name='fake'>`example`</a>``",
    '<a data-id="fake"></a>',
    '<a title=\'id="fake"\'></a>',
])
def test_fake_explicit_anchor_is_rejected(repo, example):
    root, _ = repo
    (root / "docs/brain/other.md").write_text(example + "\n")
    (root / "docs/brain/card.md").write_text("[bad](other.md#fake)\n")
    result = run(root, "--write-inventory")
    assert result.returncode != 0, result.stdout
    assert "broken anchor #fake" in result.stderr


@pytest.mark.parametrize("element", [
    '<a id="real"></a>', "<a name='real'></a>",
    '<a title="`code`" id="real"></a>',
    '<section id = "real"></section>',
    '<a title="a > b" name = \'real\'></a>',
    '`<a id="fake"></a>` <span id="real"></span>',
])
def test_real_explicit_anchor_is_accepted(repo, element):
    root, _ = repo
    (root / "docs/brain/other.md").write_text(element + "\n")
    (root / "docs/brain/card.md").write_text("[ok](other.md#real)\n")
    result = run(root, "--write-inventory")
    assert result.returncode == 0, result.stderr
    assert run(root).returncode == 0


@pytest.mark.parametrize("heading,slug", [
    ("Hello _world_", "hello-world"),
    ("Hello __world__", "hello-world"),
    ("Hello ___world___", "hello-world"),
    ("_Hello **world**_", "hello-world"),
    ("Hello *world*", "hello-world"),
    ("Hello **world**", "hello-world"),
    ("Hello _a_", "hello-a"),
    ("Hello snake_case", "hello-snake_case"),
    ("Hello snake__case", "hello-snake__case"),
    ("Hello `_world_`", "hello-_world_"),
    ("Hello ``_world_ `code` ``", "hello-_world_-code-"),
    (r"Hello \_world\_", "hello-_world_"),
    ("Hello _world", "hello-_world"),
    ("Hello __`snake_case`__", "hello-snake_case"),
])
@pytest.mark.parametrize("style", ["atx", "setext"])
def test_rendered_heading_anchor_is_accepted(repo, heading, slug, style):
    root, _ = repo
    rendered = f"# {heading}\n" if style == "atx" else f"{heading}\n===\n"
    (root / "docs/brain/other.md").write_text(rendered + rendered)
    (root / "docs/brain/card.md").write_text(
        f"[ok](other.md#{slug}) [repeat](other.md#{slug}-1)\n"
    )
    result = run(root, "--write-inventory")
    assert result.returncode == 0, result.stderr
    assert run(root).returncode == 0


def test_unrendered_emphasis_anchor_is_rejected(repo):
    root, _ = repo
    (root / "docs/brain/other.md").write_text("# Hello _world_\n")
    (root / "docs/brain/card.md").write_text("[bad](other.md#hello-_world_)\n")
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "broken anchor #hello-_world_" in result.stderr


def test_stale_warning_in_fence_is_not_visible(repo):
    root, manifest = repo
    manifest["pages"][0].update(status="stale", stale_reason="Review pending")
    save(root, manifest)
    (root / "docs/brain/card.md").write_text("# Card\n```\n> STALE: Review pending\n```\n")
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "visible" in result.stderr


def test_inventory_cannot_overwrite_another_repo_file(repo):
    root, _ = repo
    source = root / "source.py"
    before = source.read_bytes()
    (root / "docs/brain/inventory.json").symlink_to(source)
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert source.read_bytes() == before


def test_inventory_detects_page_and_manifest_changes(repo):
    root, manifest = repo
    assert run(root, "--write-inventory").returncode == 0
    with (root / "docs/brain/card.md").open("a") as f:
        f.write("\nMore prose.\n")
    assert run(root).returncode != 0
    assert run(root, "--write-inventory").returncode == 0
    manifest["pages"][0]["owner"] = "Docs team"
    save(root, manifest)
    assert run(root).returncode != 0
    assert run(root, "--write-inventory").returncode == 0
    assert run(root).returncode == 0


@pytest.mark.parametrize("field,value", [("path", "source.py"), ("evidence", [None])])
def test_invalid_page_shape(repo, field, value):
    root, manifest = repo
    manifest["pages"][0][field] = value
    save(root, manifest)
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "Traceback" not in result.stderr


def test_default_rejects_source_drift_without_writes(repo):
    root, _ = repo
    assert run(root, "--write-inventory").returncode == 0
    (root / "source.py").write_text("changed\n")
    before = {p.relative_to(root): p.read_bytes() for p in root.rglob("*") if p.is_file()}
    result = run(root)
    assert result.returncode != 0
    assert "hash drift" in result.stderr
    assert {p.relative_to(root): p.read_bytes() for p in root.rglob("*") if p.is_file()} == before


def test_inventory_read_only_and_idempotent(repo):
    root, _ = repo
    assert run(root).returncode != 0
    assert not (root / "docs/brain/inventory.json").exists()
    before = (root / "docs/brain/manifest.json").read_bytes()
    result = run(root, "--write-inventory")
    assert result.returncode == 0, result.stdout + result.stderr
    inventory = root / "docs/brain/inventory.json"
    first = inventory.read_bytes()
    assert run(root).returncode == 0
    assert run(root, "--write-inventory").returncode == 0
    assert inventory.read_bytes() == first
    assert (root / "docs/brain/manifest.json").read_bytes() == before
    inventory.write_text("{}")
    assert run(root).returncode != 0
    assert inventory.read_text() == "{}"


@pytest.mark.parametrize("attribute", ['id="fake"', "name='fake'"])
def test_code_span_cannot_manufacture_html_element(repo, attribute):
    root, _ = repo
    (root / "docs/brain/card.md").write_text(
        f'# Card\n<a`code`{attribute}>\n[broken](#fake)\n')
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "broken anchor" in result.stderr


@pytest.mark.parametrize("attribute", ['id="fake"', "name='fake'"])
@pytest.mark.parametrize("slashes", [0, 1, 2, 3, 4])
def test_html_anchor_backslash_parity(repo, attribute, slashes):
    root, _ = repo
    card = root / "docs/brain/card.md"
    target = root / "docs/brain/other.md"
    card.write_text("# Card\n[anchor](other.md#fake)\n")
    target.write_text("\\" * slashes + f"<a {attribute}></a>\n")
    expected = slashes % 2 == 0
    generated = run(root, "--write-inventory")
    assert (generated.returncode == 0) is expected, generated.stderr
    checked = run(root)
    assert (checked.returncode == 0) is expected, checked.stderr
    if not expected:
        assert "broken anchor" in checked.stderr


@pytest.mark.parametrize("link", [
    "[nested [label]](missing.md)",
    "[multiline\nlabel](missing.md)",
    "[paren](missing(name).md)",
    "[code `label`](missing.md)",
    "[shortcut]\n\n[shortcut]: missing.md",
    "[collapsed][]\n\n[collapsed]: missing.md",
    "[label][Mixed   Case]\n\n[mixed case]: missing.md",
    "![alt][image]\n\n[image]: missing.png",
])
def test_parser_resolved_missing_destinations(repo, link):
    root, _ = repo
    (root / "docs/brain/card.md").write_text(link + "\n")
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "missing file path" in result.stderr


@pytest.mark.parametrize("text", [
    "[unused]: missing.md\n",
    "[unresolved][reference]\n",
    "<div>\n[not a Markdown link](missing.md)\n</div>\n",
    '<a title="[not a link](missing.md)">text</a>\n',
    "    [indented code](missing.md)\n",
    "> ```\n> [nested fenced code](missing.md)\n> ```\n",
])
def test_parser_nonlink_content_is_ignored(repo, text):
    root, _ = repo
    (root / "docs/brain/card.md").write_text(text)
    result = run(root, "--write-inventory")
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("example", [
    "<div>\n# fake\n</div>\n",
    '<!-- <a id="fake"></a> -->',
    '```html\n<a id="fake"></a>\n```',
    '    <a id="fake"></a>',
    "<script>const text = '<a id=\"fake\"></a>';</script>",
])
def test_parser_hidden_anchor_is_rejected(repo, example):
    root, _ = repo
    (root / "docs/brain/other.md").write_text(example + "\n")
    (root / "docs/brain/card.md").write_text("[bad](other.md#fake)\n")
    result = run(root, "--write-inventory")
    assert result.returncode != 0
    assert "broken anchor #fake" in result.stderr
