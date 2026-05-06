"""
Binly worker — the binnovator.

Polls bindicator_lookup_jobs for pending lookups. For each job:
  1. Resolves the council to an upstream uk_bin_collection module via upstream_map.json
  2. Runs the adapter (pure-HTTP only in Phase A; Selenium adapters return 'unsupported')
  3. Writes the schedule to bindicator_schedule_cache (council_id, postcode, uprn)
  4. Marks the job as done / error

Run:
    python worker.py            # loop forever
    python worker.py --once     # one pass, then exit
    python worker.py --job <id> # process one specific job, then exit (debugging)
"""
from __future__ import annotations

import argparse
import importlib
import json
import os
import re
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import supa


def _schedule_signature(schedule: list) -> str:
    """Produce a stable string fingerprint of a schedule for equality checks.
    Order-insensitive (sorted), considers (date, bin_type) pairs only."""
    if not isinstance(schedule, list):
        return ""
    pairs = []
    for e in schedule:
        if isinstance(e, dict):
            d = e.get("collection_date") or e.get("date") or ""
            b = e.get("bin_type") or e.get("type") or ""
            pairs.append(f"{d}|{b}")
    return "||".join(sorted(pairs))


def substitute_url(url: str, uprn: str | None, postcode: str | None) -> str:
    """Substitute {uprn}, {uprn:12} (zero-padded), {postcode}, {postcode_plus}
    placeholders into a url_template. Returns empty string if url is empty."""
    if not url:
        return ""
    out = url
    if uprn:
        out = out.replace("{uprn:12}", uprn.zfill(12))
        out = out.replace("{uprn}", uprn)
    if postcode:
        out = out.replace("{postcode_plus}", postcode.replace(" ", "+"))
        out = out.replace("{postcode}", postcode)
    return out

# ---------- config ----------

INTERVAL = int(os.environ.get("WORKER_INTERVAL_SECONDS", "5"))
BATCH = int(os.environ.get("WORKER_BATCH_SIZE", "5"))
MAX_ATTEMPTS = int(os.environ.get("WORKER_MAX_ATTEMPTS", "3"))

# Phase A images don't ship Chrome — Selenium adapters get short-circuited as
# 'unsupported'. Phase B images set ENABLE_SELENIUM=1 to actually run them.
ENABLE_SELENIUM = os.environ.get("ENABLE_SELENIUM", "0") == "1"

# uk_bin_collection's create_webdriver() calls ChromeDriverManager().install()
# which can pick a stale chromedriver version (causing 'status 127' crashes).
# When CHROMEDRIVER_PATH is set, we monkey-patch create_webdriver to use the
# system-installed chromedriver instead. The Phase B Dockerfile installs a
# version matched to Chrome at /usr/local/bin/chromedriver.
# Councils whose sites are protected by Cloudflare Turnstile ("verify you
# are human" checkbox). Vanilla headless Chrome fails the fingerprint check
# before the page even loads. We swap in undetected-chromedriver for these,
# which strips the headless tells Cloudflare looks for.
CLOUDFLARE_COUNCILS = {
    "gateshead",
    # Add others here as we identify them.
}

# Councils whose sites are protected by Barracuda WAFs that geo-block
# non-UK IPs (Render's Frankfurt egress hits a 'GEO_IP_BLOCK' page).
# We route Selenium through a UK datacenter proxy when WEBSHARE_PROXY_HOST
# is set. Webshare free tier gives 10 UK IPs forever.
PROXY_COUNCILS = {
    "northumberland",
    # Add others here as we identify them (Birmingham, Manchester suspected).
}

WEBSHARE_PROXY_HOST = os.environ.get("WEBSHARE_PROXY_HOST", "").strip()
WEBSHARE_PROXY_PORT = os.environ.get("WEBSHARE_PROXY_PORT", "").strip()
WEBSHARE_PROXY_USER = os.environ.get("WEBSHARE_PROXY_USER", "").strip()
WEBSHARE_PROXY_PASS = os.environ.get("WEBSHARE_PROXY_PASS", "").strip()
_WEBSHARE_CONFIGURED = bool(
    WEBSHARE_PROXY_HOST and WEBSHARE_PROXY_PORT
    and WEBSHARE_PROXY_USER and WEBSHARE_PROXY_PASS
)

# Build a Chrome extension on the fly that injects proxy auth credentials.
# Required because Chrome's --proxy-server flag doesn't support user:pass
# in the URL (would pop up a credential dialog that headless can't handle).
# The extension uses chrome.webRequest.onAuthRequired to feed the creds
# automatically, identical to the technique recommended in Webshare's
# own docs. We write the extension once at startup and reuse it.
_PROXY_EXTENSION_DIR: str | None = None

def _build_proxy_auth_extension() -> str | None:
    """Write an unpacked Chrome extension that handles proxy auth.
    Returns the directory path to load via --load-extension, or None if
    proxy creds aren't configured. Idempotent across calls.
    """
    global _PROXY_EXTENSION_DIR
    if _PROXY_EXTENSION_DIR and Path(_PROXY_EXTENSION_DIR).exists():
        return _PROXY_EXTENSION_DIR
    if not _WEBSHARE_CONFIGURED:
        return None
    try:
        ext_dir = Path("/tmp/binnovator_proxy_ext")
        ext_dir.mkdir(parents=True, exist_ok=True)
        manifest = {
            "version": "1.0.0",
            "manifest_version": 2,
            "name": "Binnovator UK Proxy",
            "permissions": [
                "proxy", "tabs", "unlimitedStorage", "storage",
                "<all_urls>", "webRequest", "webRequestBlocking",
            ],
            "background": {"scripts": ["background.js"]},
            "minimum_chrome_version": "22.0.0",
        }
        background_js = f"""
var config = {{
  mode: "fixed_servers",
  rules: {{
    singleProxy: {{
      scheme: "http",
      host: "{WEBSHARE_PROXY_HOST}",
      port: parseInt("{WEBSHARE_PROXY_PORT}")
    }},
    bypassList: ["localhost"]
  }}
}};
chrome.proxy.settings.set({{value: config, scope: "regular"}}, function() {{}});
function callbackFn(details) {{
  return {{
    authCredentials: {{
      username: "{WEBSHARE_PROXY_USER}",
      password: "{WEBSHARE_PROXY_PASS}"
    }}
  }};
}}
chrome.webRequest.onAuthRequired.addListener(
  callbackFn,
  {{urls: ["<all_urls>"]}},
  ['blocking']
);
"""
        (ext_dir / "manifest.json").write_text(json.dumps(manifest))
        (ext_dir / "background.js").write_text(background_js)
        _PROXY_EXTENSION_DIR = str(ext_dir)
        return _PROXY_EXTENSION_DIR
    except Exception as e:
        print(f"[binnovator] failed to build proxy extension: {e}", flush=True)
        return None

# Set per-job before invoking the adapter; read by our patched create_webdriver.
_CURRENT_COUNCIL: dict[str, str | None] = {"id": None}

if ENABLE_SELENIUM:
    _system_driver = os.environ.get("CHROMEDRIVER_PATH", "/usr/local/bin/chromedriver")
    if _system_driver and Path(_system_driver).exists():
        try:
            # Step 1 — stop webdriver-manager from downloading a stale driver.
            from webdriver_manager.chrome import ChromeDriverManager as _CDM
            _CDM.install = lambda self, *a, **kw: _system_driver  # type: ignore[assignment]

            # Step 2 — replace uk_bin_collection's create_webdriver entirely.
            # We pick vanilla Chrome by default, and undetected-chromedriver
            # for Cloudflare-protected councils.
            from selenium import webdriver as _sel_webdriver
            from selenium.webdriver.chrome.service import Service as _ChromeService
            from uk_bin_collection.uk_bin_collection import common as _ukbc_common

            try:
                import undetected_chromedriver as _uc  # noqa: F401
                _UC_AVAILABLE = True
            except Exception as _imp_err:
                print(f"[binnovator] undetected_chromedriver unavailable: {_imp_err}", flush=True)
                _UC_AVAILABLE = False

            def _binnovator_create_webdriver(web_driver=None, headless=True, user_agent=None, session_name=None):
                council_id = _CURRENT_COUNCIL.get("id")
                use_uc = _UC_AVAILABLE and council_id in CLOUDFLARE_COUNCILS
                use_proxy = _WEBSHARE_CONFIGURED and council_id in PROXY_COUNCILS
                print(f"[binnovator] launching Chrome for council={council_id} cloudflare_bypass={use_uc} uk_proxy={use_proxy}", flush=True)

                common_args = [
                    "--no-sandbox",
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                    "--window-size=1920,1080",
                    "--disable-blink-features=AutomationControlled",
                ]
                proxy_ext_path: str | None = None
                if use_proxy:
                    proxy_ext_path = _build_proxy_auth_extension()
                    if not proxy_ext_path:
                        print("[binnovator] WARNING: proxy requested but extension build failed; running without proxy", flush=True)

                if use_uc:
                    options = _uc.ChromeOptions()
                    for arg in common_args:
                        options.add_argument(arg)
                    if user_agent:
                        options.add_argument(f"--user-agent={user_agent}")
                    if proxy_ext_path:
                        options.add_argument(f"--load-extension={proxy_ext_path}")
                    # undetected-chromedriver takes a `headless` kwarg, NOT --headless flag.
                    drv = _uc.Chrome(
                        options=options,
                        headless=headless,
                        driver_executable_path=_system_driver,
                        use_subprocess=False,
                    )
                else:
                    options = _sel_webdriver.ChromeOptions()
                    # Chrome extensions don't load in headless=new mode, but DO load
                    # in the legacy --headless flag. Switch modes when proxy needed.
                    if headless:
                        options.add_argument("--headless" if proxy_ext_path else "--headless=new")
                    for arg in common_args:
                        options.add_argument(arg)
                    if user_agent:
                        options.add_argument(f"--user-agent={user_agent}")
                    if proxy_ext_path:
                        options.add_argument(f"--load-extension={proxy_ext_path}")
                    options.add_experimental_option("excludeSwitches", ["enable-logging"])
                    if web_driver:
                        drv = _sel_webdriver.Remote(command_executor=web_driver, options=options)
                    else:
                        drv = _sel_webdriver.Chrome(
                            service=_ChromeService(executable_path=_system_driver),
                            options=options,
                        )
                try:
                    drv.set_window_position(0, 0)
                except Exception:
                    pass
                return drv

            _ukbc_common.create_webdriver = _binnovator_create_webdriver
            # Council adapters import create_webdriver at module-load time, so we
            # also need to patch any already-loaded council module's namespace.
            for _mod_name, _mod in list(sys.modules.items()):
                if _mod_name.startswith("uk_bin_collection.uk_bin_collection.councils.") and hasattr(_mod, "create_webdriver"):
                    setattr(_mod, "create_webdriver", _binnovator_create_webdriver)
            print(f"[binnovator] patched create_webdriver (UC available: {_UC_AVAILABLE})", flush=True)
        except Exception as _e:
            traceback.print_exc()
            print(f"[binnovator] WARNING: could not patch webdriver: {_e}", flush=True)

UPSTREAM_MAP_PATH = Path(__file__).parent / "upstream_map.json"
UPSTREAM_MAP: list[dict[str, Any]] = json.loads(UPSTREAM_MAP_PATH.read_text())
COUNCIL_TO_MODULE: dict[str, dict[str, Any]] = {
    # We map by council_id (slug). The map keys upstream by Python class name,
    # so we also load a council_id -> module map from upstream_index.json if present.
}

INDEX_PATH = Path(__file__).parent / "upstream_index.json"
if INDEX_PATH.exists():
    COUNCIL_TO_MODULE = json.loads(INDEX_PATH.read_text())
else:
    # Fall back to building it from upstream_map.json when each entry has a
    # `council_id` field. (We add this field below in the mapper script.)
    for entry in UPSTREAM_MAP:
        cid = entry.get("council_id")
        if cid:
            COUNCIL_TO_MODULE[cid] = entry


# ---------- pure-HTTP overrides for proxied councils ----------
#
# Some council sites are blocked by Barracuda WAFs that geo-fence non-UK IPs.
# We have a UK datacenter proxy (Webshare) for those. Selenium + Chrome
# extension proxy auth is fragile in headless mode, so for sites whose form
# flow is simple HTML POSTs (no client-side JS validation), we skip the
# browser entirely and drive the form with `requests.Session` through the
# Webshare HTTP proxy. The form structure has been verified live via curl.

def _proxy_dict() -> dict[str, str] | None:
    if not _WEBSHARE_CONFIGURED:
        return None
    auth = f"{WEBSHARE_PROXY_USER}:{WEBSHARE_PROXY_PASS}"
    host = f"{WEBSHARE_PROXY_HOST}:{WEBSHARE_PROXY_PORT}"
    proxy_url = f"http://{auth}@{host}"
    return {"http": proxy_url, "https": proxy_url}


def _http_northumberland(postcode: str, uprn: str) -> dict:
    """Drive the Northumberland postcode lookup form via plain HTTP through
    the UK proxy. Mirrors the Selenium adapter's flow:
      1. GET  /postcode             -> form with postcode input
      2. POST /postcode (postcode=) -> address-select page with <select id='address'>
      3. POST /postcode (address=)  -> results page with <table class='govuk-table'>
    Returns {'bins': [...]} matching the upstream adapter's contract.
    """
    import requests
    from bs4 import BeautifulSoup

    proxies = _proxy_dict()
    if not proxies:
        raise RuntimeError("Webshare proxy not configured; cannot run Northumberland HTTP adapter")

    base = "https://bincollection.northumberland.gov.uk"
    url = f"{base}/postcode"
    uprn_padded = str(uprn).zfill(12)
    pc = (postcode or "").strip().upper()
    # The form expects the postcode WITH the space (e.g. "NE46 1XQ").
    if " " not in pc and len(pc) >= 5:
        pc = pc[:-3].rstrip() + " " + pc[-3:]

    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
    }

    sess = requests.Session()
    sess.proxies.update(proxies)
    sess.headers.update(headers)

    # Step 1 — GET the form. Picks up cookies + any CSRF token if present.
    r1 = sess.get(url, timeout=30)
    r1.raise_for_status()
    soup1 = BeautifulSoup(r1.text, "html.parser")
    form1 = soup1.find("form")
    if not form1:
        raise RuntimeError("Northumberland step-1: no <form> on page")
    action1 = form1.get("action") or "/postcode"
    if action1.startswith("/"):
        action1 = base + action1
    payload1: dict[str, str] = {}
    for inp in form1.find_all("input"):
        name = inp.get("name")
        if not name:
            continue
        payload1[name] = inp.get("value", "")
    payload1["postcode"] = pc

    # Step 2 — POST postcode, expect address-select page.
    r2 = sess.post(action1, data=payload1, timeout=30)
    r2.raise_for_status()
    soup2 = BeautifulSoup(r2.text, "html.parser")
    select_el = soup2.find("select", id="address")
    if not select_el:
        # The Barracuda WAF block page would land here.
        raise RuntimeError("Northumberland step-2: address <select> missing — likely WAF/geo-block")
    form2 = select_el.find_parent("form") or soup2.find("form")
    action2 = (form2.get("action") if form2 else None) or "/postcode"
    if action2.startswith("/"):
        action2 = base + action2
    payload2: dict[str, str] = {}
    if form2:
        for inp in form2.find_all("input"):
            name = inp.get("name")
            if not name:
                continue
            payload2[name] = inp.get("value", "")
    payload2["address"] = uprn_padded

    # Confirm the UPRN actually exists in the dropdown to fail fast otherwise.
    available = {opt.get("value") for opt in select_el.find_all("option") if opt.get("value")}
    if uprn_padded not in available:
        raise RuntimeError(
            f"Northumberland step-2: uprn {uprn_padded} not in address dropdown "
            f"({len(available)} options for postcode {pc})"
        )

    # Step 3 — POST address, expect results table.
    r3 = sess.post(action2, data=payload2, timeout=30)
    r3.raise_for_status()
    soup3 = BeautifulSoup(r3.text, "html.parser")

    # Honest empty state: site explicitly tells us there are no upcoming
    # collections for this property. Return an empty list so the job is
    # finalised as 'empty' rather than 'error'.
    page_text = soup3.get_text(" ", strip=True).lower()
    if "no upcoming bin collection days" in page_text:
        print("[binnovator] northumberland: honest empty state for this property", flush=True)
        return {"bins": []}

    table = soup3.find("table", class_="govuk-table")
    if not table:
        raise RuntimeError("Northumberland step-3: results table missing")
    body = table.find("tbody")
    if not body:
        raise RuntimeError("Northumberland step-3: results <tbody> missing")

    now = datetime.now()
    current_month = now.month
    current_year = now.year
    bins: list[dict[str, str]] = []
    for row in body.find_all("tr"):
        cells = row.find_all(["th", "td"])
        if len(cells) < 2:
            continue
        # Mirror upstream layout: cell 1 (th) = date "9 September",
        # last td = bin type.
        date_str = cells[0].get_text(" ", strip=True)
        bin_type_str = cells[-1].get_text(" ", strip=True)
        if not date_str or not bin_type_str:
            continue
        parts = date_str.split()
        if len(parts) < 2:
            continue
        day_digits = "".join(c for c in parts[0] if c.isdigit())
        month_name = parts[1]
        if not day_digits or not month_name:
            continue
        if current_month >= 10 and month_name in ("January", "February", "March"):
            year = current_year + 1
        else:
            year = current_year
        try:
            d = datetime.strptime(f"{day_digits} {month_name} {year}", "%d %B %Y")
        except ValueError:
            continue
        bins.append({
            "type": bin_type_str,
            "collectionDate": d.strftime("%d/%m/%Y"),
        })
    return {"bins": bins}


HTTP_PROXY_OVERRIDES: dict[str, Any] = {
    "northumberland": _http_northumberland,
}


# ---------- bin-type mapping ----------

# uk_bin_collection adapters return free-form bin labels like "Mixed Recycling
# Bin", "General Waste", "Garden Waste". We normalise to our four canonical
# keys so the dashboard renders consistent colour coding.
def normalise_bin_type(raw: str) -> str:
    s = (raw or "").lower()
    if any(k in s for k in ("recycl", "blue", "mixed dry", "paper", "card", "glass", "plastic", "cans")):
        return "recycling"
    if any(k in s for k in ("food", "caddy", "kitchen")):
        return "food"
    if any(k in s for k in ("garden", "green", "organic")):
        return "garden"
    # default: general waste
    return "general"


# ---------- date parsing ----------

DATE_FORMATS = [
    "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y",
    "%A %d %B %Y", "%a %d %B %Y", "%a %d %b %Y", "%A %d %b %Y",
    "%d %B %Y", "%d %b %Y",
]

def parse_date(s: str) -> str | None:
    if not s:
        return None
    s = s.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


# ---------- adapter runner ----------

class AdapterUnsupported(Exception):
    pass


def run_adapter(module_name: str, url: str, uprn: str | None, postcode: str | None,
                paon: str | None, skip_get_url: bool, headless: bool = True,
                council_id: str | None = None) -> list[dict[str, str]]:
    """Import the upstream council module and execute its adapter.

    Returns a list of {collection_date: 'YYYY-MM-DD', bin_type: 'recycling'|...}.
    Raises AdapterUnsupported if the adapter requires Selenium and we don't
    have chromedriver available (Phase B).
    """
    # ----- pure-HTTP override (proxied councils) -----
    # If we have a UK proxy and a custom HTTP adapter for this council,
    # bypass Selenium + the upstream module entirely. Faster, more reliable,
    # avoids Chrome-extension-in-headless flakiness.
    if council_id and council_id in HTTP_PROXY_OVERRIDES and _WEBSHARE_CONFIGURED:
        print(f"[binnovator] using HTTP proxy override for council={council_id}", flush=True)
        try:
            override = HTTP_PROXY_OVERRIDES[council_id]
            override_data = override(postcode or "", uprn or "")
            bins = override_data.get("bins", []) if isinstance(override_data, dict) else []
            out: list[dict[str, str]] = []
            today = datetime.now(timezone.utc).date()
            for b in bins:
                raw_date = b.get("collectionDate") or b.get("collection_date")
                raw_type = b.get("type") or b.get("binType") or b.get("bin_type") or ""
                iso = parse_date(raw_date) if isinstance(raw_date, str) else None
                if not iso:
                    continue
                d = datetime.fromisoformat(iso).date()
                if d < today:
                    continue
                if (d - today).days > 70:
                    continue
                out.append({"collection_date": iso, "bin_type": normalise_bin_type(raw_type)})
            seen = set()
            deduped = []
            for r in sorted(out, key=lambda x: (x["collection_date"], x["bin_type"])):
                key = (r["collection_date"], r["bin_type"])
                if key in seen:
                    continue
                seen.add(key)
                deduped.append(r)
            return deduped
        except Exception as e:
            # Surface the error — do NOT silently fall back to Selenium, since
            # Selenium also can't reach this council from non-UK egress.
            print(f"[binnovator] HTTP proxy override failed for {council_id}: {e}", flush=True)
            raise

    full_module = f"uk_bin_collection.uk_bin_collection.councils.{module_name}"
    mod = importlib.import_module(full_module)
    # Re-bind create_webdriver in the council module's namespace if the adapter
    # imported it before our startup patch ran.
    if ENABLE_SELENIUM and hasattr(mod, "create_webdriver"):
        try:
            from uk_bin_collection.uk_bin_collection import common as _ukbc_common
            mod.create_webdriver = _ukbc_common.create_webdriver  # type: ignore[attr-defined]
        except Exception:
            pass
    klass = getattr(mod, "CouncilClass")
    instance = klass()

    # Tell the patched create_webdriver which council we're running so it can
    # decide whether to use undetected-chromedriver for Cloudflare bypass.
    _CURRENT_COUNCIL["id"] = council_id

    # If adapter source imports selenium and we're not in Phase B, skip it.
    src = sys.modules[full_module].__file__
    needs_selenium = bool(src and "from selenium" in Path(src).read_text(errors="ignore"))
    if needs_selenium and not ENABLE_SELENIUM:
        raise AdapterUnsupported(f"{module_name} requires selenium (Phase B)")

    kwargs: dict[str, Any] = {}
    if uprn:
        kwargs["uprn"] = uprn
    if postcode:
        kwargs["postcode"] = postcode
    if paon:
        kwargs["paon"] = paon
    kwargs["skip_get_url"] = skip_get_url

    if needs_selenium:
        # Selenium adapters create their own driver via create_webdriver().
        # Pass web_driver=None (use local Chrome) and headless=True.
        kwargs["web_driver"] = None
        kwargs["headless"] = True
        target_url = substitute_url(url, uprn, postcode)
        bin_data = instance.parse_data("", url=target_url, **kwargs)
    elif not skip_get_url:
        # Pure-HTTP path: fetch the page ourselves, then hand to parse_data.
        target_url = substitute_url(url, uprn, postcode)
        page = instance.get_data(target_url) if target_url else ""
        bin_data = instance.parse_data(page, url=target_url, **kwargs)
    else:
        target_url = substitute_url(url, uprn, postcode)
        bin_data = instance.parse_data("", url=target_url, **kwargs)

    bins = bin_data.get("bins", []) if isinstance(bin_data, dict) else []

    out: list[dict[str, str]] = []
    today = datetime.now(timezone.utc).date()
    for b in bins:
        raw_date = b.get("collectionDate") or b.get("collection_date")
        raw_type = b.get("type") or b.get("binType") or b.get("bin_type") or ""
        iso = parse_date(raw_date) if isinstance(raw_date, str) else None
        if not iso:
            continue
        # Only keep collections from today onward, up to 8 weeks out.
        d = datetime.fromisoformat(iso).date()
        if d < today:
            continue
        if (d - today).days > 70:
            continue
        out.append({"collection_date": iso, "bin_type": normalise_bin_type(raw_type)})

    # Dedupe + sort
    seen = set()
    deduped = []
    for r in sorted(out, key=lambda x: (x["collection_date"], x["bin_type"])):
        key = (r["collection_date"], r["bin_type"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    return deduped


# ---------- job loop ----------

def claim_jobs(limit: int) -> list[dict]:
    """Atomically claim up to `limit` pending jobs by setting status='running'."""
    return supa.rpc_or_select_then_update_pending(limit)


def process_job(job: dict) -> None:
    job_id = job["id"]
    council_id = job["council_id"]
    postcode = (job.get("postcode") or "").replace(" ", "").upper()
    uprn = job.get("uprn")
    paon = (job.get("result") or {}).get("paon") if isinstance(job.get("result"), dict) else None
    # Also accept paon directly
    if not paon:
        paon = job.get("paon")

    entry = COUNCIL_TO_MODULE.get(council_id)
    if not entry:
        finalise(job_id, status="error", error=f"No upstream module for {council_id}")
        return

    # Refuse councils we know need data we don't capture (USRN/UUID/etc.)
    if entry.get("unsupported_reason"):
        finalise(job_id, status="unsupported", error=entry["unsupported_reason"])
        return

    module_name = entry["module"]
    url = entry.get("url_template", "")
    skip_get = bool(entry.get("skip_get_url"))

    # Defensive guard: if url_template has a long digit run with no placeholder,
    # that's the hardcoded-UPRN bug pattern. Refuse to run rather than return
    # data for the wrong property. Catches the bug if it ever resurfaces.
    if uprn and "{uprn}" not in url and "{uprn:12}" not in url and re.search(r"\d{8,}", url or ""):
        finalise(
            job_id,
            status="unsupported",
            error=f"url_template contains hardcoded property identifier without {{uprn}} placeholder: {url}",
        )
        return

    print(f"[job {job_id}] {council_id} -> {module_name} (uprn={uprn or '-'}, postcode={postcode or '-'}, paon={paon or '-'})", flush=True)

    try:
        schedule = run_adapter(module_name, url, uprn, postcode, paon=paon, skip_get_url=skip_get, council_id=council_id)
    except AdapterUnsupported as e:
        finalise(job_id, status="unsupported", error=str(e))
        return
    except Exception as e:
        traceback.print_exc()
        finalise(job_id, status="error", error=f"{type(e).__name__}: {e}")
        return

    if not schedule:
        finalise(job_id, status="empty", error=None)
        return

    # Canary: if another UPRN under this council already has the IDENTICAL
    # schedule we just produced, the url_template almost certainly isn't using
    # the user's UPRN. Refuse to write the cache. This catches the
    # hardcoded-property bug class structurally — any council where every user
    # gets the same schedule trips this on the second lookup.
    if uprn:
        try:
            existing = supa.select(
                "bindicator_schedule_cache",
                {
                    "select": "uprn,schedule",
                    "council_id": f"eq.{council_id}",
                    "uprn": f"neq.{uprn}",
                    "limit": "5",
                },
            )
            new_sig = _schedule_signature(schedule)
            for row in existing:
                if row.get("uprn") and _schedule_signature(row.get("schedule") or []) == new_sig:
                    msg = (
                        f"canary tripped: identical schedule already cached for council={council_id} "
                        f"under uprn={row['uprn']} (this lookup uprn={uprn}). "
                        f"url_template likely ignores UPRN."
                    )
                    print(f"[job {job_id}] {msg}", flush=True)
                    finalise(job_id, status="error", error=msg)
                    # Also flag the council in freshness so ops can see it.
                    try:
                        supa.upsert(
                            "bindicator_council_freshness",
                            [{
                                "council_id": council_id,
                                "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
                                "last_status": "error",
                                "last_error": msg,
                                "refresh_method": "worker",
                            }],
                            on_conflict="council_id",
                        )
                    except Exception:
                        pass
                    return
        except Exception as e:
            # Canary check is best-effort — never block a legit lookup.
            print(f"[job {job_id}] canary check failed (non-fatal): {e}", flush=True)

    # Write to schedule cache.
    supa.upsert(
        "bindicator_schedule_cache",
        [{
            "council_id": council_id,
            "postcode": postcode,
            "uprn": uprn,
            "schedule": schedule,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "source": "live",
        }],
        on_conflict="council_id,postcode,uprn",
    )

    # Mark freshness.
    supa.upsert(
        "bindicator_council_freshness",
        [{
            "council_id": council_id,
            "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
            "last_status": "ok",
            "last_error": None,
            "refresh_method": "worker",
        }],
        on_conflict="council_id",
    )

    finalise(job_id, status="done", error=None, count=len(schedule))
    print(f"[job {job_id}] OK — {len(schedule)} collections", flush=True)


def finalise(job_id: str, status: str, error: str | None, count: int = 0) -> None:
    supa.update(
        "bindicator_lookup_jobs",
        {"id": f"eq.{job_id}"},
        {
            "status": status,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "last_error": error,
            "result": {"count": count} if count else None,
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="One pass, then exit")
    parser.add_argument("--job", help="Process a single job id, then exit")
    args = parser.parse_args()

    if args.job:
        # Manual debugging: claim that one job.
        rows = supa.select("bindicator_lookup_jobs", {"id": f"eq.{args.job}", "select": "*", "limit": "1"})
        if not rows:
            print("No such job", file=sys.stderr)
            sys.exit(1)
        process_job(rows[0])
        return

    while True:
        try:
            jobs = claim_jobs(BATCH)
        except Exception:
            print("[claim] error", flush=True)
            traceback.print_exc()
            jobs = []

        if not jobs:
            if args.once:
                return
            time.sleep(INTERVAL)
            continue

        for job in jobs:
            process_job(job)

        if args.once:
            return


if __name__ == "__main__":
    main()
