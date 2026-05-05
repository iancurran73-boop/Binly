"""
Adapter base class. Each council adapter inherits from this and implements
`fetch`. The worker handles scheduling, caching, and error reporting.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable


class AdapterUnavailable(RuntimeError):
    """Raise this when a council site is briefly unavailable. The worker will
    retry next cycle and the app will fall back to the seeded schedule."""


@dataclass
class Collection:
    collection_date: date  # ISO date
    bin_type: str          # one of: general, recycling, garden, food

    def to_row(self) -> dict:
        return {
            "collection_date": self.collection_date.isoformat(),
            "bin_type": self.bin_type,
        }


class BaseAdapter:
    council_id: str = ""  # set by subclass
    source_url: str = ""  # documented in subclass

    def fetch(self, postcode: str, uprn: str | None) -> Iterable[Collection]:
        raise NotImplementedError

    def normalise_bin_type(self, raw: str) -> str:
        s = (raw or "").lower()
        if "food" in s or "caddy" in s:
            return "food"
        if "garden" in s or "green" in s:
            return "garden"
        if "recycl" in s or "blue" in s or "mixed" in s or "paper" in s:
            return "recycling"
        return "general"
