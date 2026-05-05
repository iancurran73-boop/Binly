"""
Newcastle City Council bin lookup.

Source: https://community.newcastle.gov.uk/my-neighbourhood/ajax/getBinsNew.php

Newcastle has a public AJAX endpoint that takes a UPRN and returns JSON. No
Selenium required for this one. UPRN can be looked up from
https://api.os.uk/search/places (we expect the user to have one already
because onboarding asks the council picker first).
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterable

import requests

from .base import AdapterUnavailable, BaseAdapter, Collection


class NewcastleAdapter(BaseAdapter):
    council_id = "newcastle-upon-tyne"
    source_url = "https://community.newcastle.gov.uk/my-neighbourhood/ajax/getBinsNew.php"

    def fetch(self, postcode: str, uprn: str | None) -> Iterable[Collection]:
        if not uprn:
            raise AdapterUnavailable("Newcastle adapter needs a UPRN.")
        try:
            res = requests.get(
                self.source_url,
                params={"uprn": uprn},
                headers={"User-Agent": "Binly/1.0"},
                timeout=20,
            )
            res.raise_for_status()
            payload = res.json()
        except (requests.RequestException, ValueError) as e:
            raise AdapterUnavailable(f"Newcastle endpoint unreachable: {e}") from e

        out: list[Collection] = []
        for entry in payload.get("collections", []):
            try:
                d = datetime.strptime(entry["date"], "%Y-%m-%d").date()
            except (ValueError, KeyError):
                continue
            bin_type = self.normalise_bin_type(entry.get("type", ""))
            out.append(Collection(collection_date=d, bin_type=bin_type))
        return out
