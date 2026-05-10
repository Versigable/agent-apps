from __future__ import annotations

from dataclasses import dataclass, field


DEFAULT_TOPICS = [
    "AI agents",
    "agentic coding",
    "local LLM",
    "Claude Code",
    "Codex CLI",
    "OpenAI Codex",
    "vibe coding",
    "iOS apps",
    "indie apps",
    "Mac apps",
    "SwiftUI",
    "X API",
]

# Curated high-signal accounts for the radar. The first two are explicit user
# requests; the rest are intentionally close-orbit AI/product/app-development
# sources rather than broad keyword scraping.
DEFAULT_SOURCE_ACCOUNTS = [
    "AlexFinn",
    "steipete",          # Peter Steinberger
    "karpathy",          # AI builders / agent discourse
    "simonw",            # LLM tooling and grounded AI notes
    "swyx",              # AI engineer ecosystem
    "latentspacepod",    # AI engineer interviews / guests
    "KrauseFx",          # iOS/app tooling orbit around Peter Steinberger
    "marcoarment",       # indie Apple app/product orbit
    "gruber",            # Apple/platform commentary orbit
    "mckaywrigley",      # AI app/product building examples
    "shl",               # independent AI/product systems thinking
    "rauchg",            # Vercel/AI SDK/product infrastructure
    "cursor_ai",         # agentic coding product signal
    "ollama",            # local model/runtime signal
    "OpenAI",            # upstream model/tooling releases
    "AnthropicAI",       # upstream Claude/agent-tooling releases
]

# These accounts are explicitly high-signal for Merquery. Their recent original
# posts are useful even when they do not contain the narrow topic keywords in
# DEFAULT_TOPICS, so collectors may preserve them as source-watchlist items.
DEFAULT_PRIORITY_ACCOUNTS = [
    "AlexFinn",
    "steipete",
]

SOURCE_WATCHLIST_TOPIC = "source watchlist"

# Legacy xurl can only fetch user timelines; use the same curated source list as
# the official X API collector.
DEFAULT_LEGACY_ACCOUNTS = list(DEFAULT_SOURCE_ACCOUNTS)


@dataclass(frozen=True)
class RadarConfig:
    topics: list[str] = field(default_factory=lambda: list(DEFAULT_TOPICS))
    source_accounts: list[str] = field(default_factory=lambda: list(DEFAULT_SOURCE_ACCOUNTS))
    legacy_accounts: list[str] = field(default_factory=lambda: list(DEFAULT_LEGACY_ACCOUNTS))
    priority_accounts: list[str] = field(default_factory=lambda: list(DEFAULT_PRIORITY_ACCOUNTS))
    per_account_limit: int = 8
    digest_limit: int = 5
