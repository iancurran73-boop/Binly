"""
Gateshead Council bin lookup.

Source: https://www.gateshead.gov.uk/article/3150/Bin-collection-day-checker

Public form takes a postcode → returns address dropdown → selecting an
address shows the next 4 collection dates with bin types.

The page is server-rendered; we use requests + BeautifulSoup. Selenium only
needed if Cloudflare challenges the worker (unlikely from a residential IP).
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterable

import requests
from bs4 import BeautifulSoup

from .base import AdapterUnavailable, BaseAdapter, Collection


class GatesheadAdapter(BaseAdapter):
    council_id = "gateshead"
    source_url = "https://www.gateshead.gov.uk/article/3150/Bin-collection-day-checker"

    def fetch(self, postcode: str, uprn: str | None) -> Iterable[Collection]:
        if not uprn:
            raise AdapterUnavailable("Gateshead requires a UPRN; postcode lookup needs a follow-up step.")

        # The form posts to itself with the UPRN as `addressList`.
        try:
            res = requests.post(
                self.source_url,
                data={"postcode": postcode, "addressList": uprn, "submit": "Submit"},
                headers={"User-Agent": "Binly/1.0 (+https://binly.app)"},
                timeout=20,
            )
            res.raise_for_status()
        except requests.RequestException as e:
            raise AdapterUnavailable(f"Gateshead site unreachable: {e}") from e

        soup = BeautifulSoup(res.text, "lxml")
        rows = soup.select(".bin-collection-results li, table.bin-collections tr")
        out: list[Collection] = []
        for row in rows:
            text = row.get_text(" ", strip=True)
            # Heuristic — pull the first date and the bin label.
            try:
                # Look for "Monday 12 May 2026" or similar
                parts = text.split()
                date_str = next(
                    (
                        p
                        for p in parts
                        if any(month in text for month in [
                            "January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December",
                        ])
                    ),
                    None,
                )
                if not date_str:
                    continue
                # Try a few common formats
                for fmt in ("%A %d %B %Y", "%d %B %Y", "%d/%m/%Y"):
                    try:
                        d = datetime.strptime(text.split(" — ")[0].strip(), fmt).date()
                        break
                    except ValueError:
                        d = None
                if not d:
                    continue
                bin_type = self.normalise_bin_type(text)
                out.append(Collection(collection_date=d, bin_type=bin_type))
            except Exception:
                continue
        return out
