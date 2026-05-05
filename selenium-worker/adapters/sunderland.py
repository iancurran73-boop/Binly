"""
Sunderland City Council bin lookup.

Source: https://webapps.sunderland.gov.uk/WEBAPPS/WSS/Sunderland_Portal/Forms/binsearch.aspx

ASP.NET form (viewstate, eventvalidation, postback). Easiest path is to
request the page once to grab the hidden fields, post the postcode, then
post the address selection. Returns a JSON-ish HTML fragment with dates.

Stub: the workflow is documented; once we have a UPRN to test with we
fill in the parser. Until then, the worker will write a `status='stale'`
record and the app falls back to the seeded schedule.
"""
from __future__ import annotations

from typing import Iterable

from .base import AdapterUnavailable, BaseAdapter, Collection


class SunderlandAdapter(BaseAdapter):
    council_id = "sunderland"
    source_url = "https://webapps.sunderland.gov.uk/WEBAPPS/WSS/Sunderland_Portal/Forms/binsearch.aspx"

    def fetch(self, postcode: str, uprn: str | None) -> Iterable[Collection]:
        # TODO: implement ASP.NET viewstate flow once we have a sample UPRN.
        raise AdapterUnavailable("Sunderland adapter pending — using cached schedule for now.")
