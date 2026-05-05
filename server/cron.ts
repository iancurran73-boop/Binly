/**
 * Daily cron tasks.
 *
 * Designed to be invoked by an external scheduler (Render cron, GitHub Actions,
 * Supabase scheduled edge function, or a bare cron entry). The endpoint at
 * /api/cron/daily authenticates with the CRON_SECRET header and runs:
 *
 *   1. tomorrow_nudge — for every active push subscription whose household has a
 *      collection tomorrow, send a "your X bin goes out tomorrow" push.
 *   2. morning_nudge  — same, but for collections happening today (sent only if
 *      the household has notify_morning_of enabled).
 *   3. weekly_refresh — for every council that hasn't been refreshed in >7 days,
 *      enqueue a refresh job (or fall back to seeded if Selenium is unavailable).
 */
import { supabase } from "./supabase";
import { sendPushToHousehold } from "./push";
import { runBinAnalyst, runBinCheck } from "./agents";

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function binCharacterLine(bin: string): string {
  const b = bin.toLowerCase();
  if (/recyc/.test(b)) return "The recycling bin wants its 15 minutes.";
  if (/garden/.test(b)) return "Garden bin, in clog. You know the drill.";
  if (/food|caddy/.test(b)) return "Food caddy out. Banana skins are counting on you.";
  if (/general|refuse|household/.test(b)) return "General waste, marching orders.";
  return "Bin out, head high.";
}

export interface CronResult {
  tomorrow_pushed: number;
  morning_pushed: number;
  schedules_refreshed: number;
  errors: string[];
}

export async function runDailyCron(): Promise<CronResult> {
  const result: CronResult = {
    tomorrow_pushed: 0,
    morning_pushed: 0,
    schedules_refreshed: 0,
    errors: [],
  };

  // ---- 1. Tomorrow nudge
  try {
    const tomorrow = todayISO(1);
    const { data: tomorrowCols } = await supabase
      .from("bindicator_collections")
      .select("household_id, bin_type")
      .eq("collection_date", tomorrow);

    const grouped = new Map<string, string[]>();
    for (const c of tomorrowCols || []) {
      const arr = grouped.get(c.household_id) || [];
      arr.push(c.bin_type);
      grouped.set(c.household_id, arr);
    }

    for (const [hid, bins] of grouped.entries()) {
      const { data: prefs } = await supabase
        .from("bindicator_notification_prefs")
        .select("push_enabled, notify_day_before")
        .eq("household_id", hid)
        .maybeSingle();
      if (prefs && prefs.push_enabled === false) continue;
      if (prefs && prefs.notify_day_before === false) continue;

      const headline = bins.length === 1 ? `${bins[0]} bin out tomorrow` : `${bins.length} bins out tomorrow`;
      const body = bins.length === 1 ? binCharacterLine(bins[0]) : `Tomorrow: ${bins.join(", ")}.`;
      const { sent } = await sendPushToHousehold(hid, {
        title: headline,
        body,
        url: "/#/dashboard",
        tag: `tomorrow-${tomorrow}`,
      });
      result.tomorrow_pushed += sent;
    }
  } catch (e: any) {
    result.errors.push(`tomorrow: ${e.message}`);
  }

  // ---- 2. Morning-of nudge
  try {
    const today = todayISO(0);
    const { data: todayCols } = await supabase
      .from("bindicator_collections")
      .select("household_id, bin_type")
      .eq("collection_date", today);

    const grouped = new Map<string, string[]>();
    for (const c of todayCols || []) {
      const arr = grouped.get(c.household_id) || [];
      arr.push(c.bin_type);
      grouped.set(c.household_id, arr);
    }

    for (const [hid, bins] of grouped.entries()) {
      const { data: prefs } = await supabase
        .from("bindicator_notification_prefs")
        .select("push_enabled, notify_morning_of")
        .eq("household_id", hid)
        .maybeSingle();
      if (prefs && prefs.push_enabled === false) continue;
      if (prefs && prefs.notify_morning_of === false) continue;

      const headline = bins.length === 1 ? `Today: ${bins[0]} bin` : `Today: ${bins.length} bins`;
      const { sent } = await sendPushToHousehold(hid, {
        title: headline,
        body: "Lid up. Wheels out. Smugness on standby.",
        url: "/#/dashboard",
        tag: `morning-${today}`,
      });
      result.morning_pushed += sent;
    }
  } catch (e: any) {
    result.errors.push(`morning: ${e.message}`);
  }

  // ---- 3. Weekly schedule refresh (only households whose schedule is stale)
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stale } = await supabase
      .from("bindicator_households")
      .select("id, postcode, council_id, updated_at")
      .lt("updated_at", sevenDaysAgo)
      .limit(50); // safety cap per cron run

    for (const h of stale || []) {
      try {
        await runBinAnalyst(h.id, h.postcode, h.council_id);
        await runBinCheck(h.id, h.postcode, h.council_id);
        await supabase
          .from("bindicator_households")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", h.id);
        result.schedules_refreshed++;
      } catch (e: any) {
        result.errors.push(`refresh ${h.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    result.errors.push(`refresh: ${e.message}`);
  }

  return result;
}
