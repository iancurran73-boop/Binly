import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, Copy, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function SignInOnAnotherDevice() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function request() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/auth/request", { email: email.trim() });
      const data = await res.json();
      setVerifyUrl(data.verifyUrl || null);
      toast({
        title: "Magic link ready.",
        description: "Open it on your other device and you're in.",
      });
    } catch (err: any) {
      toast({ title: "Couldn't make a link", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!verifyUrl) return;
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Couldn't copy", description: "Long-press the link instead.", variant: "destructive" });
    }
  }

  return (
    <Card className="rounded-3xl p-6">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-2xl bg-primary/15 text-primary grid place-items-center shrink-0">
          <Mail className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-display font-semibold">Sign in on another device</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Same household, different phone? Punch in your email and we'll mint a magic link. Open it on the other device — it adopts your bin life.
          </p>

          <div className="mt-4 grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label htmlFor="auth-email" className="text-xs text-muted-foreground">Your email</Label>
              <Input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.co.uk"
                className="rounded-xl mt-1"
                data-testid="input-auth-email"
              />
            </div>
            <Button
              onClick={request}
              disabled={busy || !email.trim()}
              className="rounded-full clay-press"
              data-testid="button-request-link"
            >
              {busy ? "Conjuring…" : "Get magic link"}
            </Button>
          </div>

          {verifyUrl && (
            <div className="mt-5 rounded-2xl bg-muted/40 p-4 text-sm break-all">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Open this link on your other device
              </div>
              <div className="font-mono text-xs" data-testid="text-verify-url">{verifyUrl}</div>
              <Button
                onClick={copy}
                variant="ghost"
                size="sm"
                className="mt-3 rounded-full"
                data-testid="button-copy-link"
              >
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                Link expires in 30 minutes. Magic, but punctual.
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
