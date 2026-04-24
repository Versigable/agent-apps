from __future__ import annotations

from dataclasses import dataclass, field


DEFAULT_TOPICS = [
    "OpenClaw",
    "AI agents",
    "local LLM",
    "vibe coding",
    "homelab AI",
    "X API",
    "Claude Code",
    "Codex CLI",
]

# Legacy xurl can only fetch user timelines; these accounts are used as a
# read-only bootstrap signal until full X search API credentials/tooling exist.
DEFAULT_LEGACY_ACCOUNTS = ["AlexFinn", "chrisparkX", "XDevelopers"]


@dataclass(frozen=True)
class RadarConfig:
    topics: list[str] = field(default_factory=lambda: list(DEFAULT_TOPICS))
    legacy_accounts: list[str] = field(default_factory=lambda: list(DEFAULT_LEGACY_ACCOUNTS))
    per_account_limit: int = 8
    digest_limit: int = 5
