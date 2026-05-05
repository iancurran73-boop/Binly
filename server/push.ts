/**
 * Web Push helper. Sends a notification to every active subscription for a household.
 * Translates cleanly to native push later: when we wrap the React app in Capacitor,
 * the service worker becomes a thin bridge to FCM (Android) / APNS (iOS) and the
 * server-side payload format below stays the same.
 */
import webpush from "web-push";
import { supabase } from "./supabase";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:hello@binly.app";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
}

export async function sendPushToHousehold(
  householdId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    console.warn("[push] VAPID keys missing, skipping send");
    return { sent: 0, failed: 0 };
  }

  const { data: subs, error } = await supabase
    .from("bindicator_push_subscriptions")
    .select("*")
    .eq("household_id", householdId)
    .eq("enabled", true);

  if (error || !subs || subs.length === 0) {
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const json = JSON.stringify(payload);

  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        json,
      );
      sent++;
      await supabase
        .from("bindicator_push_subscriptions")
        .update({ last_success_at: new Date().toISOString(), last_error: null })
        .eq("id", s.id);
    } catch (e: any) {
      failed++;
      const status = e?.statusCode;
      // 410 Gone / 404 Not Found = subscription dead, disable it
      if (status === 410 || status === 404) {
        await supabase
          .from("bindicator_push_subscriptions")
          .update({ enabled: false, last_error: `gone:${status}` })
          .eq("id", s.id);
      } else {
        await supabase
          .from("bindicator_push_subscriptions")
          .update({ last_error: String(e?.message || e).slice(0, 300) })
          .eq("id", s.id);
      }
    }
  }

  return { sent, failed };
}
