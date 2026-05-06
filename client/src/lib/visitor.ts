/**
 * Stable visitor ID.
 *
 * Persistence layers (in order of preference):
 *   1. localStorage  ('binly:uid')   — survives URL strips, share links, browser restarts
 *   2. URL query     (?uid=...)      — works in sandboxed iframes / preview deploys where
 *                                       localStorage is partitioned or blocked
 *   3. in-memory                     — last-resort fallback per page load
 *
 * On read we hydrate from localStorage first, fall back to the URL, and write back to
 * both whenever we resolve an id. That way clearing the URL doesn't sign anyone out,
 * and signing in on a magic link still propagates everywhere.
 */

const STORAGE_KEY = "binly:uid";

function generateId(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readStorage(): string | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeStorage(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode or partitioned storage — fall through to URL/memory */
  }
}

function clearStorage(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

let memoId: string | null = null;

export function getVisitorId(): string {
  // 1. localStorage wins. If present, sync the URL so the existing
  //    apiRequest plumbing keeps working without changes.
  const stored = readStorage();
  if (stored) {
    memoId = stored;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("uid") !== stored) {
        url.searchParams.set("uid", stored);
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      /* ignore */
    }
    return stored;
  }

  // 2. URL fallback (covers preview iframes where localStorage is blocked,
  //    and one-time hydration when a magic link drops a uid into the URL).
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("uid");
    if (fromUrl) {
      memoId = fromUrl;
      writeStorage(fromUrl);
      return fromUrl;
    }
    if (memoId) {
      url.searchParams.set("uid", memoId);
      window.history.replaceState({}, "", url.toString());
      writeStorage(memoId);
      return memoId;
    }
    const fresh = generateId();
    memoId = fresh;
    url.searchParams.set("uid", fresh);
    window.history.replaceState({}, "", url.toString());
    writeStorage(fresh);
    return fresh;
  } catch {
    if (!memoId) memoId = generateId();
    return memoId;
  }
}

/**
 * Adopt an authenticated user id (e.g. after magic-link verify).
 * Persists into localStorage AND ?uid= so requests use it on the next render
 * and the user stays signed in across reloads.
 */
export function setVisitorId(id: string): void {
  memoId = id;
  writeStorage(id);
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("uid", id);
    window.history.replaceState({}, "", url.toString());
  } catch {
    /* ignore — memoId + storage are enough */
  }
}

/**
 * Forget the current visitor id. Used when signing out — wipes localStorage,
 * strips ?uid= from the URL, and resets the in-memory cache so the next
 * getVisitorId() call mints a fresh anonymous id.
 */
export function clearVisitorId(): void {
  memoId = null;
  clearStorage();
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("uid")) {
      url.searchParams.delete("uid");
      window.history.replaceState({}, "", url.toString());
    }
  } catch {
    /* ignore */
  }
}
