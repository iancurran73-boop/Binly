import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, BellRing } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type State = "unknown" | "unsupported" | "denied" | "not-subscribed" | "subscribed";

export function PushOptIn() {
  const { toast } = useToast();
  const [state, setState] = useState<State>("unknown");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "subscribed" : "not-subscribed");
      } catch {
        setState("not-subscribed");
      }
    })();
  }, []);

  async function subscribe() {
    setBusy(true);
    try {
      if (Notification.permission !== "granted") {
        const result = await Notification.requestPermission();
        if (result !== "granted") {
          setState(result === "denied" ? "denied" : "not-subscribed");
          setBusy(false);
          return;
        }
      }
      const keyRes = await fetch("/api/push/vapid-public-key");
      const { publicKey } = await keyRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys?: { p256dh?: string; auth?: string };
      };
      await apiRequest("POST", "/api/push/subscribe", {
        endpoint: json.endpoint,
        keys: {
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
      });
      setState("subscribed");
      toast({
        title: "You're in.",
        description: "Bin alerts incoming. Quietly heroic.",
      });
    } catch (err: any) {
      toast({
        title: "Couldn't enable alerts",
        description: err?.message || "Try again in a sec.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await apiRequest("POST", "/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("not-subscribed");
      toast({ title: "Alerts off.", description: "We'll stop nagging. You'll forget." });
    } catch (err: any) {
      toast({ title: "Couldn't disable", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/push/test", {});
      toast({ title: "Test sent.", description: "Should land in a few seconds." });
    } catch (err: any) {
      toast({ title: "Test failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="rounded-3xl p-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-2xl bg-accent/15 text-accent grid place-items-center shrink-0">
          {state === "subscribed" ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-display font-semibold">Bin alerts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            A nudge the night before. A nudge the morning of. Nothing else, ever. Bin there, reminded that.
          </p>

          {state === "unsupported" && (
            <p className="mt-4 text-sm text-muted-foreground">
              Your browser doesn't do push. Add Binly to your home screen on iOS or use Chrome on Android.
            </p>
          )}

          {state === "denied" && (
            <div className="mt-4 text-sm text-muted-foreground flex items-start gap-2">
              <BellOff className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Notifications are blocked in your browser settings. Flip the switch there and we'll be ready.</span>
            </div>
          )}

          {state === "not-subscribed" && (
            <Button
              onClick={subscribe}
              disabled={busy}
              className="mt-4 rounded-full clay-press"
              data-testid="button-enable-push"
            >
              {busy ? "Hooking up…" : "Turn on bin alerts"}
            </Button>
          )}

          {state === "subscribed" && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                onClick={sendTest}
                disabled={busy}
                variant="outline"
                className="rounded-full clay-press"
                data-testid="button-test-push"
              >
                Send a test
              </Button>
              <Button
                onClick={unsubscribe}
                disabled={busy}
                variant="ghost"
                className="rounded-full clay-press"
                data-testid="button-disable-push"
              >
                Turn off
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
