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

const TOKEN_TTL_MINUTES = 30;

export function newToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function newUserId(): string {
  return "u_" + crypto.randomBytes(12).toString("hex");
}

export async function requestMagicLink(email: string, currentUserId?: string) {
  const token = newToken();
  // Re-use the existing visitor id if one is supplied so their household stays attached.
  const userId = currentUserId && currentUserId.startsWith("u_") ? currentUserId : newUserId();
  const expires = new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000).toISOString();

  await supabase.from("bindicator_magic_links").insert({
    email: email.toLowerCase().trim(),
    token,
    user_id: userId,
    expires_at: expires,
  });

  return { token, userId, expiresAt: expires };
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

  return { ok: true as const, userId: link.user_id, email: link.email };
}
