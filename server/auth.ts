/**
 * Magic-link auth.
 *
 * Flow:
 *   1. POST /api/auth/request { email } → creates a one-time token, returns the verify URL
 *      so the client (or a real email provider later) can deliver it.
 *   2. GET  /api/auth/verify?token=… → marks token used, creates a session, returns the
 *      user_id the client should adopt as its X-Visitor-Id going forward.
 *
 * NOTE: emails are NOT sent server-side here. The reminder system is push-based per
 * product decision; magic links are intended to be delivered by whatever channel the
 * caller prefers (we currently surface the link directly in dev / log it in prod).
 * Wiring an email provider later is a one-line swap in `requestMagicLink`.
 */
import crypto from "node:crypto";
import { supabase } from "./supabase";
import { sendEmail, magicLinkEmail, welcomeEmail } from "./email";

const TOKEN_TTL_MINUTES = 30;

export function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function newUserId(): string {
  return "u_" + crypto.randomBytes(12).toString("hex");
}

export async function requestMagicLink(
  email: string,
  currentUserId?: string,
  buildVerifyUrl?: (token: string) => string,
) {
  const token = newToken();
  // Re-use the existing visitor id if one is supplied so their household stays attached.
  const userId = currentUserId && currentUserId.startsWith("u_") ? currentUserId : newUserId();
  const expires = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();
  const cleanEmail = email.toLowerCase().trim();

  await supabase.from("bindicator_magic_links").insert({
    email: cleanEmail,
    token,
    user_id: userId,
    expires_at: expires,
  });

  // Fire the email if a URL builder was supplied. Safe degradation built in:
  // when RESEND_API_KEY is unset the helper logs and returns ok:false, and the
  // caller still gets the verifyUrl back to surface directly.
  let emailed: { ok: boolean; reason?: string } = { ok: false, reason: "no-url-builder" };
  if (buildVerifyUrl) {
    const verifyUrl = buildVerifyUrl(token);
    const tpl = magicLinkEmail(cleanEmail, verifyUrl);
    const r = await sendEmail({
      to: cleanEmail,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      tag: "magic-link",
    });
    emailed = r.ok ? { ok: true } : { ok: false, reason: r.reason };
  }

  return { token, userId, expiresAt: expires, emailed };
}

export async function verifyMagicLink(token: string) {
  const { data: link } = await supabase
    .from("bindicator_magic_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!link) return { ok: false as const, reason: "Invalid link" };
  if (link.used_at) return { ok: false as const, reason: "Link already used" };
  if (new Date(link.expires_at) < new Date()) return { ok: false as const, reason: "Link expired" };

  await supabase
    .from("bindicator_magic_links")
    .update({ used_at: new Date().toISOString() })
    .eq("id", link.id);

  await supabase.from("bindicator_sessions").insert({
    user_id: link.user_id,
    email: link.email,
  });

  // Fire the welcome email on first verified session for this email.
  // Safe-degrades to a log line if Resend isn't configured. We don't await
  // the result blocking the auth response — caller can move on immediately.
  void (async () => {
    try {
      const { count } = await supabase
        .from("bindicator_sessions")
        .select("id", { count: "exact", head: true })
        .eq("email", link.email);
      if ((count ?? 0) <= 1) {
        const tpl = welcomeEmail(link.email);
        await sendEmail({
          to: link.email,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          tag: "welcome",
        });
      }
    } catch (e) {
      console.error("[binnovator email] welcome send failed", e);
    }
  })();

  return { ok: true as const, userId: link.user_id, email: link.email };
}
