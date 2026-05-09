import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import { BinIcon, classifyBin } from "@/components/BinIcon";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Collection, Council, Household, Streak } from "@shared/schema";
import {
  Loader2, RefreshCw, ShieldCheck, AlertTriangle, Trophy, ExternalLink,
  Search, Sparkles, Crown,
} from "lucide-react";
import charGeneral from "@/assets/char-general.png";
import charRecycling from "@/assets/char-recycling.png";
import charGarden from "@/assets/char-garden.png";
import foodBin from "@/assets/bin-food.png";
import { fireBinFireworks, thunkSound } from "@/lib/fx";
import { BinCards } from "@/components/BinCards";

interface LookupStatus {
  state:
    | "cache"
    | "live"
    | "pending"
    | "empty"
    | "unsupported"
    | "seeded"
    | "no-household"
    | "no-council";
  schedule: Collection[];
  fetched_at: string | null;
  job_status: string | null;
  job_error: string | null;
  uprn: string | null;
  paon: string | null;
  address: string | null;
  council_name: string | null;
}

interface Horoscope {
  week: string;
  headline: string;
  body: string;
  omen: string;
  binOfTheWeek: "general" | "recycling" | "garden" | "food";
}

function formatDate(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(iso + "T07:00:00");
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "long" }),
    day: d.toLocaleDateString("en-GB", { day: "numeric" }),
    month: d.toLocaleDateString("en-GB", { month: "short" }),
  };
}

function isThisWeek(iso: string): boolean {
  const d = new Date(iso + "T07:00:00").getTime();
  const now = new Date();
  const diffDays = (d - now.getTime()) / 86400_000;
  return diffDays >= -1 && diffDays <= 7;
}

function groupByDate(items: Collection[]) {
  const map = new Map<string, Collection[]>();
  for (const c of items) {
    const list = map.get(c.collection_date) || [];
    list.push(c);
    map.set(c.collection_date, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

const CHAR_FOR_BIN: Record<string, string> = {
  general: charGeneral,
  recycling: charRecycling,
  garden: charGarden,
  food: foodBin,
};

const BIN_OF_WEEK_COPY: Record<string, string> = {
  general: "The General is feeling… general.",
  recycling: "Recycling is on a roll. Rinse, squish, repeat.",
  garden: "The Garden bin's having a moment. Hedge it accordingly.",
  food: "Food caddy season. Banana skins to bones — the lot.",
};

export default function Dashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const { data: household, isLoading: hLoading } = useQuery<Household | null>({ queryKey: ["/api/household"] });
  const { data: collections = [], isLoading: cLoading } = useQuery<Collection[]>({ queryKey: ["/api/collections"] });
  const { data: councils = [] } = useQuery<Council[]>({ queryKey: ["/api/councils"] });
  const { data: streak } = useQuery<Streak | null>({ queryKey: ["/api/streak"] });

  // Poll lookup-status while a worker job is in flight. As soon as the
  // worker writes to cache, the next poll switches to state='cache' and we
  // invalidate /api/collections so the schedule re-renders.
  const { data: lookup } = useQuery<LookupStatus>({
    queryKey: ["/api/lookup-status"],
    enabled: !!household,
    refetchInterval: (q) => {
      const s = (q.state.data as LookupStatus | undefined)?.state;
      return s === "pending" ? 3000 : false;
    },
  });

  // When the worker finishes, refresh the materialised collections so the
  // dashboard moves out of the "Rummaging…" state on the next render.
  useEffect(() => {
    if (lookup?.state === "cache" || lookup?.state === "live") {
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
    }
  }, [lookup?.state, qc]);
  const { data: horoscope } = useQuery<Horoscope | null>({
    queryKey: ["/api/horoscope"],
    enabled: !!household,
  });

  const council = councils.find((c) => c.id === household?.council_id);

  const grouped = useMemo(() => groupByDate(collections), [collections]);
  const thisWeek = grouped.filter(([d]) => isThisWeek(d));
  const upcoming = grouped.slice(thisWeek.length);

  const refresh = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/refresh")).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
      qc.invalidateQueries({ queryKey: ["/api/agent-runs"] });
      toast({ title: "Bin Check finished", description: "Schedule re-verified. Wheelie good." });
    },
    onError: (err: any) =>
      toast({ title: "Re-run failed", description: err.message, variant: "destructive" }),
  });

  const markBinOut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/streak/mark")).json(),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/streak"] });
      qc.invalidateQueries({ queryKey: ["/api/achievements"] });
      thunkSound();
      const milestones = [1, 4, 12, 26, 52];
      const isMilestone = milestones.includes(data?.current_streak);
      fireBinFireworks(isMilestone ? 3 : 1);
      toast({
        title: isMilestone ? `${data.current_streak} weeks. Iconic.` : "Bin out. Counted.",
        description: isMilestone
          ? "Streak milestone unlocked. Smug nod authorised."
          : "Streaks rewarded. Smugness encouraged.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Couldn't mark it", description: err.message, variant: "destructive" }),
  });

  if (hLoading)
    return (
      <PageShell>
        <div className="py-32 text-center text-muted-foreground">
          <Loader2 className="h-6 w-6 mx-auto animate-spin" />
          <p className="mt-3 text-sm">Wheeling your data over…</p>
        </div>
      </PageShell>
    );

  if (!household) {
    return (
      <PageShell>
        <div className="max-w-xl mx-auto text-center py-20">
          <h2 className="text-3xl font-display font-semibold">Bin there? Not yet.</h2>
          <p className="mt-3 text-muted-foreground">Drop your postcode and we'll wheel out the schedule.</p>
          <Link href="/onboard">
            <Button size="lg" className="mt-6 rounded-full clay-press" data-testid="button-go-onboard">Sort my bins</Button>
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <p className="text-sm text-muted-foreground" data-testid="text-household-context">
            {household.address_line ? `${household.address_line} · ` : ""}
            {household.postcode} · {council?.name}
          </p>
          <h1 className="mt-1 text-xl md:text-xl font-display font-semibold tracking-tight" data-testid="text-page-title">
            {thisWeek.length === 0 ? "All quiet on the kerb." : "This week's bins"}
          </h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            className="rounded-full clay-press"
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
            data-testid="button-refresh"
          >
            {refresh.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh schedule
          </Button>
          {council?.missed_collection_url && (
            <Button
              variant="outline"
              className="rounded-full clay-press"
              data-testid="button-missed-collection"
              onClick={async () => {
                const url = council.missed_collection_url!;
                const opened = window.open(url, "_blank", "noopener,noreferrer");
                if (!opened) {
                  try {
                    await navigator.clipboard.writeText(url);
                    toast({
                      title: "Link copied",
                      description: `Paste it into a new browser tab to report your missed bin to ${council.name}.`,
                    });
                  } catch {
                    toast({
                      title: `Open this in a new tab`,
                      description: url,
                    });
                  }
                }
              }}
            >
              <ExternalLink className="h-4 w-4 mr-2" /> Missed bin?
            </Button>
          )}
        </div>
      </div>

      {cLoading ? (
        <div className="py-16 text-center text-muted-foreground">
          <Loader2 className="h-5 w-5 mx-auto animate-spin" />
          <p className="mt-2 text-sm">Asking the council nicely…</p>
        </div>
      ) : thisWeek.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-6">
          {thisWeek.map(([date, items]) => (
            <BinCard key={date} date={date} items={items} highlighted />
          ))}
        </div>
      ) : collections.length === 0 && lookup?.state === "pending" ? (
        <Card className="rounded-3xl p-8" data-testid="card-rummaging">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary grid place-items-center">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-display font-semibold">Rummaging through the council site…</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                We're asking {lookup.council_name ?? "your council"} for your schedule. It usually takes 10–20 seconds. We'll show real dates as soon as they land — we won't make any up.
              </p>
            </div>
          </div>
        </Card>
      ) : collections.length === 0 && lookup?.state === "unsupported" ? (
        <Card className="rounded-3xl p-8">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-100 text-amber-700 grid place-items-center">
              <ExternalLink className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-display font-semibold">{council?.name} — real lookup rolling out.</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                We won't make up dates. Your council's schedule isn't wired into Binly yet — we're going through them in priority order. Until then, check the official page.
              </p>
              {council?.name && (
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(council.name + ' council bin collection lookup')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="outline" className="mt-4 rounded-full clay-press">
                    <ExternalLink className="h-4 w-4 mr-2" /> Find {council.name} bin lookup
                  </Button>
                </a>
              )}
            </div>
          </div>
        </Card>
      ) : collections.length === 0 && lookup?.state === "empty" ? (
        <Card className="rounded-3xl p-8" data-testid="card-empty-fetch">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary grid place-items-center">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-display font-semibold">No upcoming dates yet.</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {lookup.council_name ?? "Your council"} answered, but didn't return any bins for your address in the next 30 days. Tap refresh in a moment — councils sometimes lag.
              </p>
            </div>
          </div>
        </Card>
      ) : collections.length === 0 ? (
        <Card className="rounded-3xl p-10 text-center">
          <p className="text-muted-foreground">Nothing on the kerb this week. Take five. Lid down. Smug nod.</p>
        </Card>
      ) : (
        <Card className="rounded-3xl p-10 text-center">
          <p className="text-muted-foreground">Nothing on the kerb this week. Take five. Lid down. Smug nod.</p>
        </Card>
      )}

      <section className="mt-12 grid md:grid-cols-2 gap-6">
        <Card className="rounded-3xl p-6 overflow-hidden relative">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary grid place-items-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-display font-semibold">Your bin horoscope</h3>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">
                Week of {horoscope?.week ?? "—"}
              </p>
              {horoscope ? (
                <>
                  <p className="mt-3 text-base font-display font-semibold leading-snug" data-testid="text-horoscope-headline">
                    {horoscope.headline}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed" data-testid="text-horoscope-body">
                    {horoscope.body}
                  </p>
                  <p className="mt-3 text-xs italic text-accent" data-testid="text-horoscope-omen">
                    Omen — {horoscope.omen}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Consulting the wheelie ouija…</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="rounded-3xl p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-accent/15 text-accent grid place-items-center">
              <Crown className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-display font-semibold">Bin of the Week</h3>
              {horoscope ? (
                <>
                  <div className="mt-3 flex items-center gap-4">
                    <img
                      src={CHAR_FOR_BIN[horoscope.binOfTheWeek]}
                      alt={`${horoscope.binOfTheWeek} bin character`}
                      className="h-20 w-20 object-contain transition-transform hover:scale-110 hover:-rotate-3"
                      data-testid="img-bin-of-week"
                    />
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">
                        This week's icon
                      </div>
                      <div className="text-lg font-display font-semibold capitalize">
                        {horoscope.binOfTheWeek}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {BIN_OF_WEEK_COPY[horoscope.binOfTheWeek]}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Crowning a champion…</p>
              )}
            </div>
          </div>
        </Card>
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold">Coming up</h2>
          <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)} data-testid="button-toggle-upcoming">
            {showAll ? "Show less" : `Show all (${upcoming.length})`}
          </Button>
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-4">
          {(showAll ? upcoming : upcoming.slice(0, 6)).map(([date, items]) => (
            <BinCard key={date} date={date} items={items} compact />
          ))}
          {upcoming.length === 0 && (
            <Card className="rounded-3xl p-6 col-span-3 text-center">
              <p className="text-muted-foreground text-sm">Schedule's empty after this week. Hit refresh to fetch more.</p>
            </Card>
          )}
        </div>
      </section>

      <section className="mt-12">
        <BinCards />
      </section>

      <section className="mt-12 grid md:grid-cols-2 gap-6">
        <Card className="rounded-3xl p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-accent/15 text-accent grid place-items-center">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-display font-semibold">Bin streak</h3>
              <p className="text-sm text-muted-foreground">Streaks rewarded. Smugness encouraged.</p>
              <div className="mt-4 flex items-end gap-3">
                <div className="text-5xl font-display font-bold tabular-nums" data-testid="text-current-streak">
                  {streak?.current_streak ?? 0}
                </div>
                <div className="text-sm text-muted-foreground pb-2">
                  current · longest <span className="text-foreground font-medium">{streak?.longest_streak ?? 0}</span>
                </div>
              </div>
              {!!streak?.badges?.length && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {streak.badges.map((b) => (
                    <span key={b} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20" data-testid={`badge-${b}`}>
                      {b}
                    </span>
                  ))}
                </div>
              )}
              <Button
                onClick={() => markBinOut.mutate()}
                disabled={markBinOut.isPending}
                className="mt-5 rounded-full clay-press"
                data-testid="button-mark-bin-out"
              >
                {markBinOut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                I put the bin out
              </Button>
            </div>
          </div>
        </Card>

        <Card className="rounded-3xl p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/15 text-primary grid place-items-center">
              <Search className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-display font-semibold">Pizza box paradox?</h3>
              <p className="text-sm text-muted-foreground">Type an item. Get the right bin. Solved.</p>
              <Link href="/items">
                <Button variant="outline" className="mt-5 rounded-full clay-press" data-testid="button-open-items">
                  Open the lookup
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </section>
    </PageShell>
  );
}

function BinCard({ date, items, highlighted = false, compact = false }: { date: string; items: Collection[]; highlighted?: boolean; compact?: boolean }) {
  const f = formatDate(date);
  const verified = items.every((i) => i.verification_status === "verified");
  const mismatch = items.some((i) => i.verification_status === "mismatch");

  return (
    <Card
      className={`rounded-3xl overflow-hidden ${highlighted ? "shadow-lg border-2" : "shadow-sm"}`}
      style={highlighted ? { borderColor: items[0]?.bin_color || undefined } : undefined}
      data-testid={`card-collection-${date}`}
    >
      <div className={`px-6 ${compact ? "pt-5" : "pt-6"}`}>
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm uppercase tracking-wider text-muted-foreground">{f.weekday}</div>
            <div className="text-xl font-display font-semibold">{f.day} {f.month}</div>
          </div>
          {verified ? (
            <span className="text-xs flex items-center gap-1 text-accent" data-testid="badge-verified">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified
            </span>
          ) : mismatch ? (
            <span className="text-xs flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> Re-checking
            </span>
          ) : null}
        </div>
      </div>

      <div className={`px-6 ${compact ? "pb-5 pt-3" : "pb-6 pt-4"} flex flex-wrap gap-3`}>
        {items.map((it, idx) => (
          <div
            key={it.id}
            className="flex items-center gap-3 rounded-2xl bg-background/60 px-3 py-2 border border-l-4 border-card-border transition-transform hover:-translate-y-0.5"
            style={it.bin_color ? { borderLeftColor: it.bin_color } : undefined}
            data-testid={`text-bin-${classifyBin(it.bin_type)}`}
          >
            <BinIcon binType={it.bin_type} className={compact ? "h-12 w-12" : "h-20 w-20"} wobble={highlighted} index={idx} />
            <div>
              <div className="font-medium leading-tight flex items-center gap-2">
                {it.bin_color && (
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: it.bin_color }}
                    aria-hidden="true"
                  />
                )}
                {it.bin_type}
              </div>
              <div className="text-xs text-muted-foreground">{classifyBin(it.bin_type)}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-6xl mx-auto px-6 md:px-10 py-10">{children}</main>
    </div>
  );
}
