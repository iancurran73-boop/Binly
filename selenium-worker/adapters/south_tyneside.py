"""
South Tyneside Council bin lookup.

Source: https://www.southtyneside.gov.uk/article/77108/

Lightweight form. Stubbed pending sample UPRN.
"""
from __future__ import annotations

from typing import Iterable

from .base import AdapterUnavailable, BaseAdapter, Collection


class SouthTynesideAdapter(BaseAdapter):
    council_id = "south-tyneside"
    source_url = "https://www.southtyneside.gov.uk/article/77108/"

    def fetch(self, postcode: str, uprn: str | None) -> Iterable[Collection]:
        raise AdapterUnavailable("South Tyneside adapter pending — using cached schedule for now.")
