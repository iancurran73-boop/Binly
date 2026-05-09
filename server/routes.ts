import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import { supabase } from "./supabase";
import { runBinAnalyst, runBinCheck } from "./agents";
import { onboardSchema, itemSearchSchema, inviteMemberSchema } from "../shared/schema";
import { publicShape as councilPublicShape } from "./councilRequirements";
import { getBinHoroscope } from "./horoscope";
import { sendPushToHousehold } from "./push";
import { requestMagicLink, verifyMagicLink } from "./auth";
import { runDailyCron } from "./cron";
import { lookupSchedule } from "./lookup";

async function awardAchievement(householdId: string, achievementId: string) {
  await supabase
    .from("bindicator_earned_achievements")
    .insert({ household_id: householdId, achievement_id: achievementId })
    .select()
    .maybeSingle();
}

function getUserId(req: Request): string {
  const headerId = req.header("X-Visitor-Id");
  if (headerId) return headerId;
  const queryId = (req.query.uid as string) || "";
  return queryId || "anon";
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  // ---- Health
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  // ---- Address autocomplete by postcode (Ideal Postcodes).
  // Server-side only — keeps the API key off the client. Returns a friendly
  // shape so Onboard never has to know what UPRN means; it just shows the
  // user a list of addresses and captures the right identifiers behind the
  // scenes when they pick one.
  app.get("/api/address-lookup", async (req, res) => {
    const raw = String(req.query.postcode || "").trim();
    const normalised = raw.toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(normalised)) {
      return res.status(400).json({ message: "That doesn't look like a UK postcode." });
    }
    const apiKey = process.env.IDEAL_POSTCODES_API_KEY;
    if (!apiKey) {
      return res.status(503).json({
        message: "Address lookup isn't configured yet. Pop your house number in below.",
        addresses: [],
      });
    }
    try {
      const url = `https://api.ideal-postcodes.co.uk/v1/postcodes/${encodeURIComponent(
        normalised,
      )}?api_key=${encodeURIComponent(apiKey)}`;
      const upstream = await fetch(url);
      if (!upstream.ok) {
        // 404 = postcode not found; everything else is a service issue.
        if (upstream.status === 404) return res.json({ addresses: [] });
        return res.status(502).json({
          message: "Address service had a wobble. Try again in a moment.",
          addresses: [],
        });
      }
      const json: any = await upstream.json();
      const result = Array.isArray(json?.result) ? json.result : [];
      const addresses = result.map((row: any) => {
        const lines = [row.line_1, row.line_2, row.line_3].filter(Boolean).join(", ");
        const label = lines
          ? `${lines}, ${row.post_town || ""}`.replace(/,\s*$/, "")
          : `${row.post_town || ""}`;
        return {
          label,
          uprn: String(row.uprn || ""),
          paon: String(row.building_number || row.building_name || row.sub_building_name || ""),
          line_1: row.line_1 || "",
          line_2: row.line_2 || "",
          post_town: row.post_town || "",
          // district = the actual local authority (e.g. "North Tyneside"),
          // NOT the postal town. This is what we match against bindicator_councils.
          district: row.district || "",
          postcode: row.postcode || normalised,
        };
      });
      // Try to auto-detect the council. Slug rule: lowercase, spaces → hyphens.
      // Falls back to undefined if no match — client shows the picker.
      let detectedCouncilId: string | undefined;
      const district = addresses[0]?.district;
      if (district) {
        const candidate = district.toLowerCase().replace(/\s+/g, "-");
        const { data: match } = await supabase
          .from("bindicator_councils")
          .select("id")
          .eq("id", candidate)
          .maybeSingle();
        if (match) {
          detectedCouncilId = match.id;
        } else {
          // Loose fallback: name match (handles edge cases like "Bristol, City of").
          const { data: byName } = await supabase
            .from("bindicator_councils")
            .select("id")
            .ilike("name", district)
            .maybeSingle();
          if (byName) detectedCouncilId = byName.id;
        }
      }
      res.json({ addresses, detectedCouncilId });
    } catch (err: any) {
      res.status(502).json({
        message: "Couldn't reach the address service.",
        addresses: [],
      });
    }
  });

  // ---- Councils (for the postcode-to-council picker). Each row is enriched
  // with the upstream requirements so the onboarding form can ask the right
  // question (UPRN vs house number) without a second round-trip.
  app.get("/api/councils", async (_req, res) => {
    const { data, error } = await supabase
      .from("bindicator_councils")
      .select("id, name, region, bin_types, missed_collection_url, data_strategy")
      .order("name");
    if (error) return res.status(500).json({ message: error.message });
    const enriched = (data || []).map((c) => ({
      ...c,
      requirements: councilPublicShape(c.id),
    }));
    res.json(enriched);
  });

  // ---- Household for current visitor
  app.get("/api/household", async (req, res) => {
    const userId = getUserId(req);
    const { data, error } = await supabase
      .from("bindicator_households")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return res.status(500).json({ message: error.message });
    res.json(data || null);
  });

  // ---- Onboard / setup
  app.post("/api/onboard", async (req, res) => {
    const userId = getUserId(req);
    const parse = onboardSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: parse.error.issues[0].message });
    const input = parse.data;

    // Wipe any existing household for this visitor (single-household MVP)
    await supabase.from("bindicator_households").delete().eq("user_id", userId);

    const { data: created, error } = await supabase
      .from("bindicator_households")
      .insert({
        user_id: userId,
        name: input.household_name || null,
        postcode: input.postcode.toUpperCase().replace(/\s+/g, ""),
        address_line: input.address_line || null,
        council_id: input.council_id,
        uprn: input.uprn || null,
        paon: input.paon || null,
      })
      .select()
      .single();
    if (error || !created) return res.status(500).json({ message: error?.message || "Failed" });

    await supabase.from("bindicator_streaks").insert({ household_id: created.id });
    await supabase.from("bindicator_notification_prefs").insert({
      household_id: created.id,
      email_address: input.email,
    });

    // Newsletter consent is OPT-IN only. We never write a row with consent=true
    // unless the user ticked the box. If they didn't, we don't store the email
    // here at all — the operational reminder email lives in notification_prefs
    // and stays out of marketing reach.
    if (input.bulletin_opt_in) {
      const cleanEmail = input.email.trim().toLowerCase();
      await supabase.from("bindicator_bulletin_subscribers").upsert(
        {
          email: cleanEmail,
          consent: true,
          consent_at: new Date().toISOString(),
          source: "onboarding",
          postcode: created.postcode,
          council_id: created.council_id,
          household_id: created.id,
          unsubscribed_at: null,
        },
        { onConflict: "email" },
      );
    }

    // Kick off analyst + checker in the background; the dashboard polls
    // /api/lookup-status to surface progress. Don't block the onboard response
    // on an upstream council site that might be slow.
    runBinAnalyst(created.id, created.postcode, created.council_id, {
      uprn: created.uprn,
      paon: created.paon,
    })
      .then(() => runBinCheck(created.id, created.postcode, created.council_id, {
        uprn: created.uprn,
        paon: created.paon,
      }))
      .catch((e: any) => console.error("[onboard] background analyst failed", e?.message ?? e));

    res.json(created);
  });

  // ---- Collections — next 8 weeks
  app.get("/api/collections", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id, council_id, postcode")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!household) return res.json([]);

    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("bindicator_collections")
      .select("*")
      .eq("household_id", household.id)
      .gte("collection_date", today)
      .order("collection_date", { ascending: true });
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ---- Re-run agents for the current household
  app.post("/api/refresh", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });

    try {
      const analyst = await runBinAnalyst(household.id, household.postcode, household.council_id, {
        uprn: (household as any).uprn,
        paon: (household as any).paon,
      });
      const checker = await runBinCheck(household.id, household.postcode, household.council_id, {
        uprn: (household as any).uprn,
        paon: (household as any).paon,
      });
      res.json({ analyst, checker });
    } catch (e: any) {
      res.status(500).json({ message: e.message || "Agent failed" });
    }
  });

  // ---- Item lookup — "what goes in which bin?"
  //
  // Strategy:
  //  1. Broad ILIKE across item_name, notes, tip, category (catches "Costa cup"
  //     even though it only appears in `tip`).
  //  2. If no hits, fall back to pg_trgm similarity on item_name (catches typos
  //     like "teabag" -> "Tea bag", "banana skin" -> "Banana peel").
  //  3. If still nothing, log the unknown query to bindicator_unknown_items so
  //     we can grow the catalogue from real user demand.
  app.get("/api/items", async (req, res) => {
    const userId = getUserId(req);
    const parse = itemSearchSchema.safeParse({ query: req.query.q });
    if (!parse.success) return res.status(400).json({ message: "Provide q" });
    const q = parse.data.query.trim();
    const qLower = q.toLowerCase();

    const { data: household } = await supabase
      .from("bindicator_households")
      .select("council_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.json([]);

    // 1. Broad substring match across the searchable text columns.
    const escaped = qLower.replace(/[%_]/g, (c) => `\\${c}`);
    const broad = await supabase
      .from("bindicator_items")
      .select("*")
      .eq("council_id", household.council_id)
      .or(
        `item_name.ilike.%${escaped}%,notes.ilike.%${escaped}%,tip.ilike.%${escaped}%,category.ilike.%${escaped}%`
      )
      .limit(8);
    if (broad.error) return res.status(500).json({ message: broad.error.message });
    if (broad.data && broad.data.length > 0) {
      return res.json(broad.data);
    }

    // 2. Trigram fuzzy match — only fires when the broad ILIKE returned nothing.
    //    Threshold 0.25 catches typos without dragging in unrelated noise.
    const fuzzy = await supabase.rpc("binly_search_items_fuzzy", {
      p_council_id: household.council_id,
      p_query: qLower,
      p_limit: 8,
    });
    if (!fuzzy.error && Array.isArray(fuzzy.data) && fuzzy.data.length > 0) {
      return res.json(fuzzy.data);
    }

    // 3. Nothing matched — log the miss for the catalogue backlog, then return [].
    //    Fire-and-forget; never block the response on logging.
    if (qLower.length >= 2) {
      supabase
        .from("bindicator_unknown_items")
        .upsert(
          {
            council_id: household.council_id,
            query: qLower,
            search_count: 1,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "council_id,query", ignoreDuplicates: false }
        )
        .then(async ({ error: upsertError }) => {
          if (upsertError) return;
          // Bump the counter on existing rows (upsert above only sets it to 1
          // for inserts — increments require a follow-up RPC).
          await supabase.rpc("binly_bump_unknown_item", {
            p_council_id: household.council_id,
            p_query: qLower,
          });
        })
        .catch(() => {
          /* swallow — logging is best-effort */
        });
    }

    return res.json([]);
  });

  app.get("/api/items/all", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("council_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.json([]);
    const { data, error } = await supabase
      .from("bindicator_items")
      .select("*")
      .eq("council_id", household.council_id)
      .order("item_name");
    if (error) return res.status(500).json({ message: error.message });
    res.json(data);
  });

  // ---- Streak: "I put the bin out"
  app.get("/api/streak", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.json(null);
    const { data } = await supabase
      .from("bindicator_streaks")
      .select("*")
      .eq("household_id", household.id)
      .maybeSingle();
    res.json(data);
  });

  app.post("/api/streak/mark", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });

    const { data: existing } = await supabase
      .from("bindicator_streaks")
      .select("*")
      .eq("household_id", household.id)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

    let current = existing?.current_streak || 0;
    let longest = existing?.longest_streak || 0;
    const last = existing?.last_marked_date || null;
    const badges: string[] = (existing?.badges as any) || [];

    if (last === today) {
      // already marked today, no-op
    } else if (last === yesterday || !last) {
      current = current + 1;
    } else {
      current = 1; // streak reset
    }
    if (current > longest) longest = current;

    const milestoneBadges: Record<number, string> = {
      1: "First bin out",
      4: "Month of bins",
      12: "Quarterly champion",
      26: "Half-year hero",
      52: "Bin year",
    };
    if (milestoneBadges[current] && !badges.includes(milestoneBadges[current])) {
      badges.push(milestoneBadges[current]);
    }

    // Award streak achievements
    const streakAwards: Record<number, string> = {
      1: "first_bin",
      2: "week_one",
      4: "month_one",
      12: "quarter",
      26: "half_year",
      52: "year",
    };
    if (streakAwards[current]) await awardAchievement(household.id, streakAwards[current]);

    // Easter eggs based on time of day
    const hour = new Date().getHours();
    if (hour >= 22) await awardAchievement(household.id, "night_owl");
    if (hour < 7) await awardAchievement(household.id, "early_bird");

    const upsertPayload = {
      household_id: household.id,
      current_streak: current,
      longest_streak: longest,
      last_marked_date: today,
      badges,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("bindicator_streaks").upsert(upsertPayload);
    res.json(upsertPayload);
  });

  // ---- Bin horoscope — gloriously absurd weekly fortune
  app.get("/api/horoscope", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.json(null);
    // Award the easter-egg badge for opening the horoscope
    await awardAchievement(household.id, "horoscope_reader");
    res.json(getBinHoroscope(household.id));
  });

  // ---- Achievements
  app.get("/api/achievements", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: catalog } = await supabase
      .from("bindicator_achievements")
      .select("*")
      .order("rarity");
    if (!household) return res.json({ catalog: catalog || [], earned: [] });
    const { data: earned } = await supabase
      .from("bindicator_earned_achievements")
      .select("*")
      .eq("household_id", household.id);
    res.json({ catalog: catalog || [], earned: earned || [] });
  });

  // ---- Item lookup easter-egg awards
  app.post("/api/items/looked-up", async (req, res) => {
    const userId = getUserId(req);
    const { item_name } = req.body as { item_name?: string };
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.json({ ok: true });
    await awardAchievement(household.id, "curious_one");
    if (item_name && item_name.toLowerCase().includes("pizza")) {
      await awardAchievement(household.id, "pizza_paradox");
      await awardAchievement(household.id, "greasy_truth");
    }
    res.json({ ok: true });
  });

  // ---- Household members (sharing)
  app.get("/api/members", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.json([]);
    const { data } = await supabase
      .from("bindicator_household_members")
      .select("*")
      .eq("household_id", household.id)
      .order("invited_at", { ascending: true });
    res.json(data || []);
  });

  app.post("/api/members", async (req, res) => {
    const userId = getUserId(req);
    const parse = inviteMemberSchema.safeParse(req.body);
    if (!parse.success) return res.status(400).json({ message: parse.error.issues[0].message });
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });
    const { data, error } = await supabase
      .from("bindicator_household_members")
      .insert({
        household_id: household.id,
        email: parse.data.email,
        display_name: parse.data.display_name || null,
        role: "member",
      })
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    await awardAchievement(household.id, "sharer");
    res.json(data);
  });

  app.delete("/api/members/:id", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });
    await supabase
      .from("bindicator_household_members")
      .delete()
      .eq("id", req.params.id)
      .eq("household_id", household.id);
    res.json({ ok: true });
  });

  // ---- Binly Bulletin: confirm consent (post-bug double-opt-in)
  // The token is embedded in the welcome edition. Sets confirmation_status
  // to 'confirmed' and flips consent to true. Idempotent.
  app.get("/api/bulletin/confirm", async (req, res) => {
    const token = String(req.query.t || "").trim();
    if (!token || token.length < 16) return res.status(400).send("Invalid token");
    const { data: row, error: lookupErr } = await supabase
      .from("bindicator_bulletin_subscribers")
      .select("email, confirmation_status")
      .eq("confirmation_token", token)
      .maybeSingle();
    if (lookupErr || !row) return res.status(404).send("Token not found");
    if (row.confirmation_status !== "confirmed") {
      const { error } = await supabase
        .from("bindicator_bulletin_subscribers")
        .update({
          confirmation_status: "confirmed",
          consent: true,
          consent_at: new Date().toISOString(),
          unsubscribed_at: null,
        })
        .eq("confirmation_token", token);
      if (error) return res.status(500).send("Couldn't confirm \u2014 sorry. Try again or email hello@binly.uk");
    }
    res.send(
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>You're in | Binly</title>" +
      "<style>body{font-family:system-ui;max-width:520px;margin:80px auto;padding:0 24px;color:#1a1a1a;line-height:1.6;text-align:center}h1{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:32px;margin:0 0 16px;color:#0f172a}.tick{font-size:56px;margin-bottom:8px}p{color:#475569}a{display:inline-block;margin-top:24px;background:#16a34a;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600}</style>" +
      "</head><body><div class=\"tick\">\u2705</div><h1>You're in.</h1>" +
      "<p>The Binly Bulletin will land in your inbox once a week, max. Probably less. Always free, properly honest.</p>" +
      "<a href=\"https://binly.uk\">Back to Binly</a></body></html>"
    );
  });

  // ---- Binly Bulletin: one-click unsubscribe (GDPR Article 21 + PECR Reg 22)
  // The token is embedded in every email footer. No login required to use.
  app.get("/api/bulletin/unsubscribe", async (req, res) => {
    const token = String(req.query.t || "").trim();
    if (!token || token.length < 16) return res.status(400).send("Invalid token");
    const { error } = await supabase
      .from("bindicator_bulletin_subscribers")
      .update({ unsubscribed_at: new Date().toISOString(), consent: false })
      .eq("unsubscribe_token", token);
    if (error) return res.status(500).send("Couldn't unsubscribe — sorry. Try again or email hello@binly.app");
    // Plain HTML response — no JS, works in any email client's preview.
    res.send(
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>Unsubscribed | Binly</title>" +
      "<style>body{font-family:system-ui;max-width:520px;margin:80px auto;padding:0 24px;color:#1a1a1a;line-height:1.6}h1{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:28px;margin:0 0 16px}p{color:#555}</style>" +
      "</head><body><h1>You're off the list.</h1>" +
      "<p>The Binly Bulletin will leave you alone. Your bin reminders will keep working as normal \u2014 they live in a different place.</p>" +
      "<p>If this was a mistake, just go back to the dashboard and tick the box again.</p></body></html>"
    );
  });

  // ---- Waitlist for non-pilot councils
  app.post("/api/waitlist", async (req, res) => {
    const { email, council_id, postcode } = req.body as {
      email?: string;
      council_id?: string;
      postcode?: string;
    };
    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Need a valid email" });
    }
    const { error } = await supabase.from("bindicator_waitlist").insert({
      email: email.trim().toLowerCase(),
      council_id: council_id || null,
      postcode: postcode || null,
    });
    if (error) return res.status(500).json({ message: error.message });
    res.json({ ok: true });
  });

  // ---- Bin cards: contamination confession + recovery ledger
  app.get("/api/cards", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) {
      return res.json({ current: "green", yellow_count: 0, red_count: 0, recent: [] });
    }

    const { data: cards } = await supabase
      .from("bindicator_bin_cards")
      .select("*")
      .eq("household_id", household.id)
      .order("issued_at", { ascending: false })
      .limit(20);

    const list = cards || [];
    const latest = list[0];
    const yellow_count = list.filter((c: any) => c.card_color === "yellow").length;
    const red_count = list.filter((c: any) => c.card_color === "red").length;
    const current = latest?.card_color || "green";

    res.json({ current, yellow_count, red_count, recent: list });
  });

  app.post("/api/cards/confess", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });

    const { reason, bin_type, item_name } = req.body as {
      reason?: string;
      bin_type?: string;
      item_name?: string;
    };

    // Determine the new card color: count yellow cards in last 14 days
    const fortnightAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
    const { data: recent } = await supabase
      .from("bindicator_bin_cards")
      .select("card_color, issued_at")
      .eq("household_id", household.id)
      .gte("issued_at", fortnightAgo)
      .order("issued_at", { ascending: false });

    const recentYellows = (recent || []).filter((c: any) => c.card_color === "yellow").length;
    const newColor: "yellow" | "red" = recentYellows >= 2 ? "red" : "yellow";

    const { data: created, error } = await supabase
      .from("bindicator_bin_cards")
      .insert({
        household_id: household.id,
        card_color: newColor,
        reason: reason || null,
        bin_type: bin_type || null,
        item_name: item_name || null,
      })
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });

    if (newColor === "yellow") await awardAchievement(household.id, "yellow_card");
    if (newColor === "red") await awardAchievement(household.id, "red_card");

    res.json(created);
  });

  app.post("/api/cards/clear", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });

    // Clearing requires the most recent card to be older than 7 days
    const { data: latest } = await supabase
      .from("bindicator_bin_cards")
      .select("*")
      .eq("household_id", household.id)
      .neq("card_color", "green")
      .order("issued_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) return res.status(400).json({ message: "Already on green. Smug nod." });

    const ageDays = (Date.now() - new Date(latest.issued_at).getTime()) / 86400_000;
    if (ageDays < 7) {
      return res.status(400).json({
        message: `Patience. ${Math.ceil(7 - ageDays)} clean day(s) to go.`,
      });
    }

    const { data: created, error } = await supabase
      .from("bindicator_bin_cards")
      .insert({
        household_id: household.id,
        card_color: "green",
        reason: "Earned back to green",
      })
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    await awardAchievement(household.id, "clean_sheet");
    res.json(created);
  });

  // ---- Recent agent runs (for the verification badge)
  app.get("/api/agent-runs", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.json([]);
    const { data } = await supabase
      .from("bindicator_agent_runs")
      .select("*")
      .eq("household_id", household.id)
      .order("ran_at", { ascending: false })
      .limit(6);
    res.json(data || []);
  });

  // ============================================================================
  // Phase 2 endpoints: push notifications, magic-link auth, cron, real lookup
  // ============================================================================

  // ---- VAPID public key for the client to subscribe with
  app.get("/api/push/vapid-public-key", (_req, res) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY || "";
    res.json({ publicKey, key: publicKey });
  });

  // ---- Subscribe a device to push for the visitor's household
  app.post("/api/push/subscribe", async (req, res) => {
    const userId = getUserId(req);
    const { endpoint, keys, user_agent } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: "Subscription payload missing keys" });
    }
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });

    await supabase
      .from("bindicator_push_subscriptions")
      .upsert(
        {
          household_id: household.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          user_agent: user_agent || req.header("user-agent") || null,
          enabled: true,
        },
        { onConflict: "household_id,endpoint" },
      );

    await supabase
      .from("bindicator_notification_prefs")
      .update({ push_enabled: true })
      .eq("household_id", household.id);

    res.json({ ok: true });
  });

  // ---- Unsubscribe (e.g. user revokes permission)
  app.post("/api/push/unsubscribe", async (req, res) => {
    const userId = getUserId(req);
    const { endpoint } = req.body || {};
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });
    if (endpoint) {
      await supabase
        .from("bindicator_push_subscriptions")
        .update({ enabled: false })
        .eq("household_id", household.id)
        .eq("endpoint", endpoint);
    } else {
      await supabase
        .from("bindicator_push_subscriptions")
        .update({ enabled: false })
        .eq("household_id", household.id);
    }
    res.json({ ok: true });
  });

  // ---- Send a test push to the current household (lets users sanity-check the setup)
  app.post("/api/push/test", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id, name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });
    const result = await sendPushToHousehold(household.id, {
      title: "Binly says hi.",
      body: "Push notifications: armed. The binnovator is on duty.",
      url: "/#/dashboard",
      tag: "test",
    });
    res.json(result);
  });

  // ---- Notification preferences: read
  app.get("/api/notification-prefs", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });
    const { data: prefs } = await supabase
      .from("bindicator_notification_prefs")
      .select("push_enabled, notify_day_before, notify_morning_of, notify_time")
      .eq("household_id", household.id)
      .maybeSingle();
    res.json(prefs || {
      push_enabled: false,
      notify_day_before: true,
      notify_morning_of: true,
      notify_time: "20:00",
    });
  });

  // ---- Notification preferences: update (partial)
  app.patch("/api/notification-prefs", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });
    const allowed: Record<string, any> = {};
    const body = req.body || {};
    if (typeof body.notify_day_before === "boolean") allowed.notify_day_before = body.notify_day_before;
    if (typeof body.notify_morning_of === "boolean") allowed.notify_morning_of = body.notify_morning_of;
    if (typeof body.push_enabled === "boolean") allowed.push_enabled = body.push_enabled;
    if (typeof body.notify_time === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(body.notify_time)) {
      allowed.notify_time = body.notify_time;
    }
    if (Object.keys(allowed).length === 0) {
      return res.status(400).json({ message: "No valid fields" });
    }
    await supabase
      .from("bindicator_notification_prefs")
      .update(allowed)
      .eq("household_id", household.id);
    res.json({ ok: true });
  });

  // ---- Ideas board: list (public, no auth required to read)
  app.get("/api/ideas", async (req, res) => {
    const userId = getUserId(req);
    const { data: ideas } = await supabase
      .from("bindicator_ideas")
      .select("id, title, body, status, upvotes, curated, submitted_by_name, created_at")
      .neq("status", "wont_do")
      .order("upvotes", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    // Which ones has this user voted on?
    let voted: Set<string> = new Set();
    if (userId) {
      const { data: votes } = await supabase
        .from("bindicator_idea_votes")
        .select("idea_id")
        .eq("user_id", userId);
      voted = new Set((votes || []).map((v) => v.idea_id));
    }

    res.json({
      ideas: (ideas || []).map((i) => ({ ...i, voted: voted.has(i.id) })),
    });
  });

  // ---- Ideas board: submit
  app.post("/api/ideas", async (req, res) => {
    const userId = getUserId(req);
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();
    const submitted_by_name = String(req.body?.name || "").trim() || null;
    if (title.length < 3 || title.length > 120) {
      return res.status(400).json({ message: "Title must be 3\u2013120 characters" });
    }
    if (body.length > 1000) {
      return res.status(400).json({ message: "Keep it under 1000 characters" });
    }
    const { data: created, error } = await supabase
      .from("bindicator_ideas")
      .insert({
        title,
        body: body || null,
        submitted_by_user_id: userId,
        submitted_by_name,
        status: "open",
      })
      .select()
      .single();
    if (error) return res.status(500).json({ message: error.message });
    res.json({ idea: created });
  });

  // ---- Ideas board: vote (toggle)
  app.post("/api/ideas/:id/vote", async (req, res) => {
    const userId = getUserId(req);
    const ideaId = req.params.id;
    if (!userId) return res.status(401).json({ message: "Not signed in" });

    // Try to insert; if it conflicts, the user has already voted -> remove
    const { error: insertErr } = await supabase
      .from("bindicator_idea_votes")
      .insert({ idea_id: ideaId, user_id: userId });

    let voted: boolean;
    if (insertErr) {
      // Already voted -> retract
      await supabase
        .from("bindicator_idea_votes")
        .delete()
        .eq("idea_id", ideaId)
        .eq("user_id", userId);
      voted = false;
    } else {
      voted = true;
    }

    // Recompute count (cheap, accurate)
    const { count } = await supabase
      .from("bindicator_idea_votes")
      .select("*", { count: "exact", head: true })
      .eq("idea_id", ideaId);
    await supabase.from("bindicator_ideas").update({ upvotes: count || 0 }).eq("id", ideaId);

    res.json({ voted, upvotes: count || 0 });
  });

  // ---- Magic-link auth: request
  app.post("/api/auth/request", async (req, res) => {
    const email = String(req.body?.email || "").trim();
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) {
      return res.status(400).json({ message: "Need a valid email" });
    }
    const currentUserId = getUserId(req);
    // Prefer PUBLIC_APP_URL when set (Render env) so emails always link to the
    // canonical binly.uk domain regardless of which host fronted the request.
    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
    const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "";
    const origin = process.env.PUBLIC_APP_URL || (host ? `${proto}://${host}` : "");
    const buildVerifyUrl = origin
      ? (token: string) => `${origin}/#/verify/${token}`
      : undefined;
    const { token, userId, expiresAt, emailed } = await requestMagicLink(
      email,
      currentUserId,
      buildVerifyUrl,
    );
    const verifyUrl = buildVerifyUrl ? buildVerifyUrl(token) : `/#/verify/${token}`;
    // If email actually went out, suppress the verifyUrl in the response so the client
    // shows a "check your inbox" state instead of a tappable link. Keeps the dev path
    // working when Resend isn't configured.
    if (emailed.ok) {
      return res.json({ ok: true, emailed: true, userId, expiresAt });
    }
    res.json({ ok: true, emailed: false, verifyUrl, userId, expiresAt });
  });

  // ---- Magic-link auth: verify
  app.post("/api/auth/verify", async (req, res) => {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.status(400).json({ message: "Missing token" });
    const result = await verifyMagicLink(token);
    if (!result.ok) return res.status(400).json({ message: result.reason });
    res.json({ ok: true, userId: result.userId, email: result.email });
  });

  // ---- Cron entry point. Auth via shared secret in the X-Cron-Secret header.
  app.post("/api/cron/daily", async (req, res) => {
    const expected = process.env.CRON_SECRET;
    const provided = req.header("X-Cron-Secret");
    if (!expected || provided !== expected) {
      return res.status(401).json({ message: "Unauthorised" });
    }
    const result = await runDailyCron();
    res.json(result);
  });

  // ---- Real council lookup (uses Selenium worker cache when available)
  app.get("/api/lookup/preview", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!household) return res.status(404).json({ message: "No household" });
    const { data: council } = await supabase
      .from("bindicator_councils")
      .select("*")
      .eq("id", household.council_id)
      .single();
    if (!council) return res.status(404).json({ message: "Council not found" });
    const result = await lookupSchedule(council, household.postcode, {
      uprn: (household as any).uprn,
      paon: (household as any).paon,
    });
    res.json(result);
  });

  // ---- Admin: re-run analyst for one or all households of a given council.
  // Used after wiring or fixing a live adapter so existing households update.
  // Auth: X-Cron-Secret header (same as /api/cron/daily).
  // ---- Lookup status — Dashboard polls this while the worker fetches.
  // Returns: { state: 'cache' | 'live' | 'pending' | 'empty' | 'unsupported',
  //            schedule, fetched_at, error?, sourceUrl? }
  app.get("/api/lookup-status", async (req, res) => {
    const userId = getUserId(req);
    const { data: household } = await supabase
      .from("bindicator_households")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!household) return res.json({ state: "no-household" });

    const council = await supabase
      .from("bindicator_councils")
      .select("*")
      .eq("id", household.council_id)
      .maybeSingle()
      .then((r) => r.data);
    if (!council) return res.json({ state: "no-council" });

    const result = await lookupSchedule(council, household.postcode, {
      uprn: (household as any).uprn,
      paon: (household as any).paon,
    });

    // If we just got fresh data from the worker, also re-run the analyst so
    // the household's stored collections are up to date.
    if (result.source === "cache" || result.source === "live") {
      runBinAnalyst(household.id, household.postcode, household.council_id, {
        uprn: (household as any).uprn,
        paon: (household as any).paon,
      }).catch(() => undefined);
    }

    res.json({
      state: result.source,
      schedule: result.schedule,
      fetched_at: result.fetched_at,
      job_status: result.job_status ?? null,
      job_error: result.job_error ?? null,
      uprn: result.uprn ?? null,
      paon: result.paon ?? null,
      address: result.address ?? null,
      council_name: council.name,
    });
  });

  app.post("/api/admin/refresh-council", async (req, res) => {
    const expected = process.env.CRON_SECRET;
    const provided = req.header("x-cron-secret");
    if (!expected || provided !== expected) {
      return res.status(401).json({ message: "Unauthorised" });
    }
    const councilId = (req.body && req.body.council_id) as string | undefined;
    if (!councilId) return res.status(400).json({ message: "council_id required" });

    const { data: households } = await supabase
      .from("bindicator_households")
      .select("*")
      .eq("council_id", councilId);

    const results: Array<{ id: string; ok: boolean; error?: string; count?: number }> = [];
    for (const h of households || []) {
      try {
        const r = await runBinAnalyst(h.id, h.postcode, h.council_id, {
          uprn: (h as any).uprn,
          paon: (h as any).paon,
        });
        results.push({ id: h.id, ok: true, count: r.schedule.length });
      } catch (e: any) {
        results.push({ id: h.id, ok: false, error: e?.message ?? String(e) });
      }
    }
    res.json({ council_id: councilId, refreshed: results.length, results });
  });

  return httpServer;
}
