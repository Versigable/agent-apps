from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone


@dataclass(frozen=True)
class Metrics:
    replies: int = 0
    reposts: int = 0
    likes: int = 0
    quotes: int = 0
    bookmarks: int = 0
    views: int = 0

    @property
    def engagement(self) -> int:
        return self.replies + self.reposts + self.likes + self.quotes + self.bookmarks


@dataclass(frozen=True)
class Post:
    id: str
    text: str
    author_username: str
    author_name: str
    created_at: datetime
    url: str
    topic: str
    metrics: Metrics = field(default_factory=Metrics)

    def __post_init__(self) -> None:
        if self.created_at.tzinfo is None:
            object.__setattr__(self, "created_at", self.created_at.replace(tzinfo=timezone.utc))
