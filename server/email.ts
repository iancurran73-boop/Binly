/**
 * Email delivery via Resend.
 *
 * Safe degradation: if RESEND_API_KEY is not set we log the would-be email
 * and return ok:false with a clear reason so callers can still surface the
 * verify URL directly (preserves the pre-Resend dev flow).
 *
 * Voice: locked. "Rummaging through your council site", "binnovator", "Binnovation",
 * "always free", "binfluencer chaos · with substance". No mentions of agents/analysts/checkers.
 */

const RESEND_API = "https://api.resend.com/emails";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  // Optional Resend tag for filtering in the dashboard
  tag?: string;
};

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; reason: string };

function fromAddress(): string {
  return process.env.EMAIL_FROM || "Binly <hello@binly.uk>";
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("[binnovator email] RESEND_API_KEY not set — skipping send", {
      to: args.to,
      subject: args.subject,
    });
    return { ok: false, reason: "no-api-key" };
  }

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        ...(args.tag ? { tags: [{ name: "category", value: args.tag }] } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[binnovator email] Resend rejected send", {
        status: res.status,
        body: body.slice(0, 300),
      });
      return { ok: false, reason: `resend-${res.status}` };
    }

    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: json.id || "unknown" };
  } catch (e) {
    console.error("[binnovator email] send failed", e);
    return { ok: false, reason: "exception" };
  }
}

// ---- Templates -------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function firstNameFromEmail(email: string): string {
  const local = email.split("@")[0] || "";
  const cleaned = local.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "binnovator";
  const first = cleaned.split(" ")[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

const FOOTER_HTML = `
  <p style="margin-top:32px;font-size:12px;color:#888;line-height:1.5">
    binly.uk · always free · binfluencer chaos · with substance<br/>
    Sent because you asked us to verify your email. If this wasn't you, just ignore it.
  </p>
`;

const FOOTER_TEXT = `\n\nbinly.uk · always free · binfluencer chaos · with substance\nSent because you asked us to verify your email. If this wasn't you, just ignore it.`;

const BASE_STYLE = `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.55;`;

export function magicLinkEmail(email: string, verifyUrl: string) {
  const firstName = firstNameFromEmail(email);
  const safeUrl = escapeHtml(verifyUrl);

  const subject = `Tap to start binnovating, ${firstName}`;

  const html = `
    <div style='${BASE_STYLE}'>
      <h1 style="font-size:22px;margin:0 0 16px">Hey ${escapeHtml(firstName)},</h1>
      <p style="margin:0 0 16px">
        Tap below and we'll start rummaging through your council site for your bin schedule.
      </p>
      <p style="margin:0 0 24px">
        <a href="${safeUrl}"
           style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:600">
          Verify and let the binnovation begin
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:#444">
        Or paste this link into your browser:
      </p>
      <p style="margin:0 0 24px;font-size:13px;color:#666;word-break:break-all">
        ${safeUrl}
      </p>
      <p style="margin:0;font-size:14px;color:#444">
        This link expires in 30 minutes.
      </p>
      <p style="margin:24px 0 0;font-size:14px;color:#444">— The binnovator</p>
      ${FOOTER_HTML}
    </div>
  `;

  const text = `Hey ${firstName},\n\nTap this link and we'll start rummaging through your council site for your bin schedule:\n\n${verifyUrl}\n\nThis link expires in 30 minutes.\n\n— The binnovator${FOOTER_TEXT}`;

  return { subject, html, text };
}

export function welcomeEmail(email: string) {
  const firstName = firstNameFromEmail(email);
  const subject = "You're in. Here's how Binnovation works";

  const html = `
    <div style='${BASE_STYLE}'>
      <h1 style="font-size:22px;margin:0 0 16px">You're in, ${escapeHtml(firstName)}.</h1>
      <p style="margin:0 0 20px">
        Three things to know:
      </p>

      <h2 style="font-size:16px;margin:20px 0 6px">Refresh schedule</h2>
      <p style="margin:0 0 16px;color:#333">
        Tap it any time to re-rummage through your council site for the latest dates.
      </p>

      <h2 style="font-size:16px;margin:20px 0 6px">Schedule history</h2>
      <p style="margin:0 0 16px;color:#333">
        Every refresh is logged. You can see exactly when we last checked and what came back.
      </p>

      <h2 style="font-size:16px;margin:20px 0 6px">Reminders</h2>
      <p style="margin:0 0 24px;color:#333">
        Turn on bin-night nudges so the binnovator pings you the evening before.
      </p>

      <p style="margin:0 0 24px;color:#444;font-size:14px">
        Most councils answer in under 10 seconds. A few are stubborn — we've built ways around them.
        You'll only ever see real schedules, never a fabricated date.
      </p>

      <p style="margin:0 0 0;font-size:14px;color:#444">— The binnovator</p>
      ${FOOTER_HTML}
    </div>
  `;

  const text = `You're in, ${firstName}.\n\nThree things to know:\n\nRefresh schedule — tap it any time to re-rummage through your council site for the latest dates.\n\nSchedule history — every refresh is logged. You can see exactly when we last checked and what came back.\n\nReminders — turn on bin-night nudges so the binnovator pings you the evening before.\n\nMost councils answer in under 10 seconds. A few are stubborn — we've built ways around them. You'll only ever see real schedules, never a fabricated date.\n\n— The binnovator${FOOTER_TEXT}`;

  return { subject, html, text };
}
