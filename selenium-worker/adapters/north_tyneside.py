"""
North Tyneside Council bin lookup.

Source: https://my.northtyneside.gov.uk/category/81/bin-collection-dates

Iframe-based form. Selenium-friendly. Stubbed pending a real UPRN sample.
"""
from __future__ import annotations

from typing import Iterable

from .base import AdapterUnavailable, BaseAdapter, Collection


class NorthTynesideAdapter(BaseAdapter):
    council_id = "north-tyneside"
    source_url = "https://my.northtyneside.gov.uk/category/81/bin-collection-dates"

    def fetch(self, postcode: str, uprn: str | None) -> Iterable[Collection]:
        raise AdapterUnavailable("North Tyneside adapter pending — using cached schedule for now.")
