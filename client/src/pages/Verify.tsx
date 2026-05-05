import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { setVisitorId } from "@/lib/visitor";
import { queryClient } from "@/lib/queryClient";

type State = "verifying" | "ok" | "error";

export default function Verify() {
  const [state, setState] = useState<State>("verifying");
  const [message, setMessage] = useState("");
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/verify/:token");

  useEffect(() => {
    (async () => {
      // Magic-link URL: /#/verify/<token>. Also fall back to ?token= query
      // for older links or manual paste.
      let token: string | null = (params && params.token) || null;
      try {
        if (!token) {
          const hash = window.location.hash || "";
          const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
          token = new URLSearchParams(q).get("token");
        }
        if (!token) {
          token = new URL(window.location.href).searchParams.get("token");
        }
      } catch {}

      if (!token) {
        setState("error");
        setMessage("No token in the link. Try requesting a fresh one.");
        return;
      }

      try {
        const res = await apiRequest("POST", "/api/auth/verify", { token });
        const data = await res.json();
        if (data.userId) {
          setVisitorId(data.userId);
          // wipe cached queries so they refetch under the new identity
          queryClient.clear();
        }
        setState("ok");
        setMessage(data.email ? `Signed in as ${data.email}.` : "Signed in.");
        setTimeout(() => setLocation("/dashboard"), 1500);
      } catch (err: any) {
        setState("error");
        // Strip the raw "400: {...}" prefix that apiRequest tacks on; show a friendlier line.
        const raw = String(err?.message || "");
        const match = raw.match(/"message"\s*:\s*"([^"]+)"/);
        setMessage(match ? match[1] : raw || "Link expired or already used. Get a fresh one.");
      }
    })();
  }, [setLocation, params?.token]);

  return (
    <div className="min-h-screen bg-background grid place-items-center px-6">
      <Card className="rounded-3xl p-8 max-w-md w-full text-center">
        {state === "verifying" && (
          <>
            <Loader2 className="h-10 w-10 mx-auto text-accent animate-spin" />
            <h1 className="mt-5 text-xl font-display font-semibold">Authenticating your bin life…</h1>
            <p className="mt-2 text-sm text-muted-foreground">Quietly heroic. Hold tight.</p>
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircle2 className="h-10 w-10 mx-auto text-accent" />
            <h1 className="mt-5 text-xl font-display font-semibold">You're in.</h1>
            <p className="mt-2 text-sm text-muted-foreground" data-testid="text-verify-message">{message}</p>
            <p className="mt-1 text-xs text-muted-foreground">Whisking you to your dashboard…</p>
          </>
        )}
        {state === "error" && (
          <>
            <AlertTriangle className="h-10 w-10 mx-auto text-destructive" />
            <h1 className="mt-5 text-xl font-display font-semibold">Magic ran out.</h1>
            <p className="mt-2 text-sm text-muted-foreground" data-testid="text-verify-message">{message}</p>
            <Link href="/settings">
              <Button className="mt-5 rounded-full clay-press">Get a new link</Button>
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
