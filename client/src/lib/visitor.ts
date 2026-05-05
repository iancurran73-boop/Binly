/**
 * Stable visitor ID kept in a URL query param (?uid=...) — works in
 * sandboxed iframes (preview deploys) AND on published *.pplx.app domains.
 * Falls back to in-memory generation per page load if the URL is unwritable.
 */

function generateId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

let memoId: string | null = null;

export function getVisitorId(): string {
  try {
    const url = new URL(window.location.href);
    const existing = url.searchParams.get("uid");
    if (existing) {
      memoId = existing;
      return existing;
    }
    if (memoId) {
      url.searchParams.set("uid", memoId);
      window.history.replaceState({}, "", url.toString());
      return memoId;
    }
    const fresh = generateId();
    memoId = fresh;
    url.searchParams.set("uid", fresh);
    window.history.replaceState({}, "", url.toString());
    return fresh;
  } catch {
    if (!memoId) memoId = generateId();
    return memoId;
  }
}

/**
 * Adopt an authenticated user id (e.g. after magic-link verify).
 * Persists into ?uid= so requests use it on the next render.
 */
export function setVisitorId(id: string): void {
  memoId = id;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("uid", id);
    window.history.replaceState({}, "", url.toString());
  } catch {
    // ignore — memoId is enough
  }
}
