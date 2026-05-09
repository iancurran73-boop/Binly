import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Smartphone, Share, Plus, MoreVertical, Home } from "lucide-react";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent.toLowerCase();
  // iPadOS 13+ reports as Mac — detect via touch
  const isIPadOS = /macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(ua) || isIPadOS) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari
  if ((window.navigator as any).standalone === true) return true;
  // Android / desktop PWA
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  return false;
}

export function AddToHomeScreen() {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [installed, setInstalled] = useState(false);
  const [tab, setTab] = useState<"ios" | "android">("ios");

  useEffect(() => {
    const p = detectPlatform();
    setPlatform(p);
    setTab(p === "android" ? "android" : "ios");
    setInstalled(isStandalone());
  }, []);

  // Already installed — don't show the card at all
  if (installed) return null;

  return (
    <Card className="rounded-3xl p-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-2xl bg-accent/15 text-accent grid place-items-center shrink-0">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-display font-semibold">Pop Binly on your home screen</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Tap once and you're in — no app store, no faff. Plus push alerts on iPhone only work
            once Binly's on your home screen.
          </p>

          {/* Tabs */}
          <div className="mt-4 inline-flex rounded-full bg-muted p-1 text-sm">
            <button
              type="button"
              onClick={() => setTab("ios")}
              className={`px-4 py-1.5 rounded-full transition-colors ${
                tab === "ios" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"
              }`}
              data-testid="tab-ios"
            >
              iPhone / iPad
            </button>
            <button
              type="button"
              onClick={() => setTab("android")}
              className={`px-4 py-1.5 rounded-full transition-colors ${
                tab === "android" ? "bg-background shadow-sm font-semibold" : "text-muted-foreground"
              }`}
              data-testid="tab-android"
            >
              Android
            </button>
          </div>

          {tab === "ios" && (
            <ol className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-accent/15 text-accent text-xs font-semibold grid place-items-center shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Open <span className="font-medium">binly.uk</span> in <span className="font-medium">Safari</span>
                  {" "}— this won't work in Chrome or other browsers on iPhone.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-accent/15 text-accent text-xs font-semibold grid place-items-center shrink-0 mt-0.5">
                  2
                </span>
                <span className="flex-1">
                  Tap the <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted font-medium">
                    <Share className="h-3.5 w-3.5" /> Share
                  </span> button at the bottom of the screen.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-accent/15 text-accent text-xs font-semibold grid place-items-center shrink-0 mt-0.5">
                  3
                </span>
                <span className="flex-1">
                  Scroll down and tap <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted font-medium">
                    <Plus className="h-3.5 w-3.5" /> Add to Home Screen
                  </span>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-accent/15 text-accent text-xs font-semibold grid place-items-center shrink-0 mt-0.5">
                  4
                </span>
                <span>
                  Tap <span className="font-medium">Add</span>. Binly'll land on your home screen with the rest of your apps.
                  Open it from there to turn on alerts.
                </span>
              </li>
            </ol>
          )}

          {tab === "android" && (
            <ol className="mt-4 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-accent/15 text-accent text-xs font-semibold grid place-items-center shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Open <span className="font-medium">binly.uk</span> in <span className="font-medium">Chrome</span>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-accent/15 text-accent text-xs font-semibold grid place-items-center shrink-0 mt-0.5">
                  2
                </span>
                <span className="flex-1">
                  Tap the <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted font-medium">
                    <MoreVertical className="h-3.5 w-3.5" /> menu
                  </span> in the top-right corner.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-accent/15 text-accent text-xs font-semibold grid place-items-center shrink-0 mt-0.5">
                  3
                </span>
                <span className="flex-1">
                  Tap <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted font-medium">
                    <Home className="h-3.5 w-3.5" /> Add to Home screen
                  </span> (sometimes called <span className="font-medium">Install app</span>).
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="h-6 w-6 rounded-full bg-accent/15 text-accent text-xs font-semibold grid place-items-center shrink-0 mt-0.5">
                  4
                </span>
                <span>
                  Tap <span className="font-medium">Add</span> or <span className="font-medium">Install</span>. Job done — Binly'll
                  open like a proper app from now on.
                </span>
              </li>
            </ol>
          )}

          {platform === "desktop" && (
            <p className="mt-4 text-xs text-muted-foreground">
              You're on a computer right now — open binly.uk on your phone to add it to your home screen.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
