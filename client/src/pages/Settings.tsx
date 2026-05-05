import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/Nav";
import type { Council, Household, AgentRun } from "@shared/schema";
import { ShieldCheck, AlertTriangle, ExternalLink } from "lucide-react";
import { PushOptIn } from "@/components/PushOptIn";
import { SignInOnAnotherDevice } from "@/components/SignInOnAnotherDevice";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export default function Settings() {
  const { data: household } = useQuery<Household | null>({ queryKey: ["/api/household"] });
  const { data: councils = [] } = useQuery<Council[]>({ queryKey: ["/api/councils"] });
  const { data: runs = [] } = useQuery<AgentRun[]>({ queryKey: ["/api/agent-runs"] });

  const council = councils.find((c) => c.id === household?.council_id);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div>
          <h1 className="text-xl md:text-xl font-display font-semibold tracking-tight" data-testid="text-page-title">
            The boring (necessary) bits.
          </h1>
          <p className="mt-3 text-muted-foreground">Your address. Your council. The audit trail. Bin there, double-checked that.</p>
        </div>

        {!household ? (
          <Card className="rounded-3xl p-8 text-center">
            <p className="text-muted-foreground">Nothing set up yet. Bin it on, then come back.</p>
            <Link href="/onboard">
              <Button className="mt-4 rounded-full clay-press" data-testid="button-go-onboard">Sort my bins</Button>
            </Link>
          </Card>
        ) : (
          <>
            <PushOptIn />
            <Card className="rounded-3xl p-6">
              <h2 className="text-lg font-display font-semibold">Household</h2>
              <dl className="mt-4 grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Postcode</dt>
                  <dd className="font-medium" data-testid="text-postcode">{household.postcode}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Address</dt>
                  <dd className="font-medium">{household.address_line || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Council</dt>
                  <dd className="font-medium">{council?.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Household nickname</dt>
                  <dd className="font-medium">{household.name || "—"}</dd>
                </div>
              </dl>
              <div className="mt-5 flex gap-3 flex-wrap">
                <Link href="/onboard">
                  <Button variant="outline" className="rounded-full clay-press" data-testid="button-edit-household">
                    Edit details
                  </Button>
                </Link>
                <Link href="/households">
                  <Button variant="outline" className="rounded-full clay-press" data-testid="button-manage-flatmates">
                    Manage flatmates
                  </Button>
                </Link>
                {council?.source_url && (
                  <a href={council.source_url} target="_blank" rel="noreferrer">
                    <Button variant="ghost" className="rounded-full clay-press">
                      <ExternalLink className="h-4 w-4 mr-2" /> Council source
                    </Button>
                  </a>
                )}
              </div>
            </Card>

            <Card className="rounded-3xl p-6">
              <h2 className="text-lg font-display font-semibold">Schedule history</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Every time the binnovator fetches and re-checks your bin schedule. Bin there, double-checked that.
              </p>
              <ul className="mt-5 divide-y divide-border/60">
                {runs.length === 0 && (
                  <li className="py-4 text-sm text-muted-foreground">No history yet. Your schedule is being pulled.</li>
                )}
                {runs.map((r) => (
                  <li key={r.id} className="py-3 flex items-center gap-3" data-testid={`run-${r.id}`}>
                    <div className={`h-8 w-8 rounded-xl grid place-items-center ${r.status === "ok" ? "bg-accent/15 text-accent" : "bg-destructive/15 text-destructive"}`}>
                      {r.status === "ok" ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{r.agent_type === "analyst" ? "Schedule fetched" : "Schedule re-checked"}</div>
                      <div className="text-xs text-muted-foreground">{timeAgo(r.ran_at)}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.result?.matched != null ? `${r.result.matched} matched / ${r.result.mismatched} flagged` : `${r.result?.count ?? "?"} entries`}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <SignInOnAnotherDevice />
          </>
        )}
      </main>
    </div>
  );
}
