import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Nav } from "@/components/Nav";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { HouseholdMember, Household } from "@shared/schema";
import { Loader2, Trash2, Mail, Users, Copy, Check } from "lucide-react";

export default function Households() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: household } = useQuery<Household | null>({ queryKey: ["/api/household"] });
  const { data: members = [], isLoading } = useQuery<HouseholdMember[]>({
    queryKey: ["/api/members"],
    enabled: !!household,
  });

  const invite = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/members", {
        email: email.trim(),
        display_name: name.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/members"] });
      qc.invalidateQueries({ queryKey: ["/api/achievements"] });
      setEmail("");
      setName("");
      toast({ title: "Invited.", description: "Share the bin load. Share the smug." });
    },
    onError: (err: any) =>
      toast({ title: "Couldn't invite", description: err.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await apiRequest("DELETE", `/api/members/${id}`)).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Removed.", description: "Bin privileges revoked." });
    },
  });

  const inviteLink = household ? `https://binly.example/?invite=${household.id}` : "";
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Link copied.", description: "Stick it in the group chat." });
    } catch {
      toast({ title: "Copy failed", description: "Pick it manually.", variant: "destructive" });
    }
  };

  if (!household) {
    return (
      <div className="min-h-screen bg-background">
        <Nav />
        <main className="max-w-3xl mx-auto px-6 md:px-10 py-20 text-center">
          <h1 className="text-xl font-display font-semibold">Set up a household first.</h1>
          <p className="mt-3 text-muted-foreground">You can't invite flatmates without a flat. Logical.</p>
          <Link href="/onboard">
            <Button className="mt-6 rounded-full clay-press" data-testid="button-go-onboard">
              Sort my bins
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-4xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div>
          <h1 className="text-xl md:text-xl font-display font-semibold tracking-tight" data-testid="text-page-title">
            Flatmates, herded.
          </h1>
          <p className="mt-3 text-muted-foreground max-w-xl">
            One person remembering bin day for everyone? That's a war crime. Invite the household. Spread the load.
          </p>
        </div>

        <Card className="rounded-3xl p-6">
          <h2 className="text-lg font-display font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Members
          </h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground mt-3">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground mt-3">
              Just you so far. Drag a flatmate in below.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-border/60">
              {members.map((m) => (
                <li key={m.id} className="py-3 flex items-center gap-3" data-testid={`row-member-${m.id}`}>
                  <div className="h-10 w-10 rounded-2xl bg-accent/10 text-accent grid place-items-center">
                    <Mail className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{m.display_name || m.email}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {m.accepted_at ? "Joined" : "Pending"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full clay-press"
                    onClick={() => remove.mutate(m.id)}
                    disabled={remove.isPending}
                    data-testid={`button-remove-${m.id}`}
                    aria-label="Remove member"
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="rounded-3xl p-6">
          <h2 className="text-lg font-display font-semibold">Invite by email</h2>
          <p className="text-sm text-muted-foreground mt-1">
            We'll email them. They get the schedule. You get glory.
          </p>
          <form
            className="mt-4 grid sm:grid-cols-3 gap-3 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.includes("@")) invite.mutate();
            }}
          >
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="member-name">Name (optional)</Label>
              <Input
                id="member-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sarah"
                className="rounded-2xl h-11"
                data-testid="input-member-name"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="member-email">Email</Label>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@flat.co.uk"
                className="rounded-2xl h-11"
                data-testid="input-member-email"
              />
            </div>
            <Button
              type="submit"
              disabled={!email.includes("@") || invite.isPending}
              className="rounded-full clay-press h-11"
              data-testid="button-invite-member"
            >
              {invite.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Send invite
            </Button>
          </form>
        </Card>

        <Card className="rounded-3xl p-6">
          <h2 className="text-lg font-display font-semibold">Or share a link</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Old-school. Reliable. Texts beautifully.
          </p>
          <div className="mt-4 flex gap-2 items-center">
            <Input
              value={inviteLink}
              readOnly
              className="rounded-2xl h-11 font-mono text-xs"
              data-testid="input-invite-link"
            />
            <Button
              variant="outline"
              onClick={copyLink}
              className="rounded-full clay-press h-11"
              data-testid="button-copy-invite"
            >
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
