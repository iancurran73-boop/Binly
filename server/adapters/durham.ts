/**
 * County Durham bin collection adapter.
 *
 * Hits Durham's public JSON-RPC AJAX endpoint (the same one their own
 * www.durham.gov.uk/bincollections page uses). No Cloudflare wall, no auth,
 * no Selenium needed. We just need to be a polite client.
 *
 * Pipeline:
 *   postcode -> durham.Localities.PostcodeLookup -> list of (uprn, address)
 *   uprn     -> durham.Localities.GetBartecCalendar -> list of jobs with ScheduledStart
 *
 * The job Name strings we care about start with:
 *   "Empty Bin Refuse"     -> general waste
 *   "Empty Bin Recycling"  -> dry recycling
 *   "Empty Bin Organic"    -> garden waste (subscribers only)
 *   "Empty Bin Food"       -> food caddy (rolling out July/August 2026; mostly absent today)
 */

import type { ScheduleEntry } from "../agents";

const ENDPOINT = "https://www.durham.gov.uk/apiserver/ajaxlibrary/";
const UA = "Mozilla/5.0 (compatible; Binly/1.0; +https://binly.app)";

interface UprnEntry {
  uprn: string;
  address: string;
}

async function jsonRpc(method: string, params: Record<string, string>): Promise<string> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method,
    params,
    id: "1",
    name: "V2 AJAX End Point Library Worker",
  });

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      "Accept": "application/json",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Durham endpoint returned ${res.status} for ${method}`);
  }

  const data = (await res.json()) as { result?: string; error?: { message: string } };
  if (data.error) throw new Error(`Durham ${method} error: ${data.error.message}`);
  return data.result ?? "";
}

export async function lookupAddresses(postcode: string): Promise<UprnEntry[]> {
  const clean = postcode.replace(/\s+/g, "").toUpperCase();
  const xml = await jsonRpc("durham.Localities.PostcodeLookup", { postcode: clean });

  const uprns = [...xml.matchAll(/<uprn>(\d+)<\/uprn>/g)].map((m) => m[1]);
  const addresses = [...xml.matchAll(/<formatted_address>([^<]+)<\/formatted_address>/g)].map((m) => m[1]);

  const out: UprnEntry[] = [];
  for (let i = 0; i < Math.min(uprns.length, addresses.length); i++) {
    out.push({ uprn: uprns[i], address: addresses[i] });
  }
  return out;
}

const BIN_TYPE_MAP: Array<{ match: RegExp; type: string; color: string }> = [
  { match: /^Empty Bin Refuse/i, type: "Rubbish", color: "#1a1a1a" },
  { match: /^Empty Bin Recycling/i, type: "Recycling", color: "#3b82f6" },
  { match: /^Empty Bin Organic/i, type: "Garden waste", color: "#8b5e3c" },
  { match: /^Empty Bin Food/i, type: "Food caddy", color: "#16a34a" },
];

function classifyJob(name: string): { type: string; color: string } | null {
  for (const m of BIN_TYPE_MAP) {
    if (m.match.test(name)) return { type: m.type, color: m.color };
  }
  return null;
}

export async function fetchSchedule(uprn: string): Promise<ScheduleEntry[]> {
  const xml = await jsonRpc("durham.Localities.GetBartecCalendar", { uprn });

  // Each <Job>...</Job> has its top-level Name and a single ScheduledStart.
  const jobBlocks = xml.match(/<Job>[\s\S]*?<\/Job>/g) ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const seen = new Set<string>();
  const entries: ScheduleEntry[] = [];

  for (const block of jobBlocks) {
    const nameMatch = block.match(/<Name xmlns="http:\/\/www\.bartec-systems\.com">([^<]+)<\/Name>/);
    const dateMatch = block.match(/<ScheduledStart>([^<]+)<\/ScheduledStart>/);
    if (!nameMatch || !dateMatch) continue;

    const date = dateMatch[1].slice(0, 10);
    if (date < today) continue;

    const cls = classifyJob(nameMatch[1].trim());
    if (!cls) continue;

    const key = `${date}|${cls.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entries.push({
      collection_date: date,
      bin_type: cls.type,
      bin_color: cls.color,
    });
  }

  entries.sort((a, b) =>
    a.collection_date < b.collection_date ? -1 : a.collection_date > b.collection_date ? 1 : 0,
  );
  return entries;
}

/**
 * One-shot lookup: postcode -> first matching property's schedule.
 * If `addressHint` is provided we'll prefer the UPRN whose formatted_address contains it.
 */
export async function lookupByPostcode(
  postcode: string,
  addressHint?: string,
): Promise<{ uprn: string; address: string; schedule: ScheduleEntry[] } | null> {
  const addrs = await lookupAddresses(postcode);
  if (addrs.length === 0) return null;

  let chosen = addrs[0];
  if (addressHint) {
    const hint = addressHint.trim().toLowerCase();
    const match = addrs.find((a) => a.address.toLowerCase().includes(hint));
    if (match) chosen = match;
  }

  const schedule = await fetchSchedule(chosen.uprn);
  return { uprn: chosen.uprn, address: chosen.address, schedule };
}
