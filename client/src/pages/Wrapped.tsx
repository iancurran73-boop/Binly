import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/Nav";
import type { Streak, Collection, Achievement, EarnedAchievement } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, Share2, Trophy } from "lucide-react";
import charGeneral from "@/assets/char-general.png";
import charRecycling from "@/assets/char-recycling.png";
import charGarden from "@/assets/char-garden.png";
import foodBin from "@/assets/bin-food.png";

const CHAR_FOR_BIN: Record<string, string> = {
  general: charGeneral,
  recycling: charRecycling,
  garden: charGarden,
  food: foodBin,
};

interface AchievementsResponse {
  catalog: Achievement[];
  earned: EarnedAchievement[];
}

function classifyBin(binType: string): "general" | "recycling" | "garden" | "food" {
  const lower = binType.toLowerCase();
  if (/food|caddy|kitchen waste|compost/.test(lower)) return "food";
  if (/garden|brown/.test(lower)) return "garden";
  if (/recyc|blue|paper|card|glass/.test(lower)) return "recycling";
  return "general";
}

export default function Wrapped() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: streak } = useQuery<Streak | null>({ queryKey: ["/api/streak"] });
  const { data: collections = [] } = useQuery<Collection[]>({ queryKey: ["/api/collections"] });
  const { data: ach } = useQuery<AchievementsResponse>({ queryKey: ["/api/achievements"] });

  const stats = useMemo(() => {
    const counts: Record<string, number> = { general: 0, recycling: 0, garden: 0, food: 0 };
    for (const c of collections) counts[classifyBin(c.bin_type)] += 1;
    const totals = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const favourite = totals[0]?.[0] ?? "general";
    const totalCollections = collections.length;
    const earnedCount = ach?.earned.length ?? 0;

    // Top "items" — derive from earned achievements as a proxy for now
    const topAchievements = (ach?.earned ?? [])
      .map((e) => ach?.catalog.find((c) => c.id === e.achievement_id))
      .filter(Boolean)
      .slice(0, 3) as Achievement[];

    return {
      currentStreak: streak?.current_streak ?? 0,
      longestStreak: streak?.longest_streak ?? 0,
      favourite,
      totalCollections,
      earnedCount,
      topAchievements,
    };
  }, [collections, streak, ach]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Link copied.", description: "Drop it. Watch the smug spread." });
    } catch {
      toast({ title: "Copy failed.", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl md:text-xl font-display font-semibold tracking-tight" data-testid="text-page-title">
              Your Bin Wrapped.
            </h1>
            <p className="mt-3 text-muted-foreground max-w-xl">
              The year (or week, we're early) in bins. Screenshot it. Share it. Be insufferable about it.
            </p>
          </div>
          <Button
            onClick={copyLink}
            className="rounded-full clay-press"
            data-testid="button-copy-wrapped"
          >
            {copied ? <Check className="h-4 w-4 mr-2" /> : <Share2 className="h-4 w-4 mr-2" />}
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </div>

        <div className="flex justify-center">
          <div
            className="w-full max-w-[420px] aspect-[9/16] rounded-[2rem] p-7 text-white shadow-2xl relative overflow-hidden"
            style={{
              background:
                "linear-gradient(155deg, #DB5A2A 0%, #B7421A 35%, #2A211A 100%)",
            }}
            data-testid="card-wrapped"
          >
            <div className="absolute inset-0 opacity-20" style={{
              background:
                "radial-gradient(circle at 80% 10%, rgba(255,255,255,0.6), transparent 40%), radial-gradient(circle at 10% 90%, rgba(255,200,140,0.4), transparent 40%)",
            }} />

            <div className="relative h-full flex flex-col">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.3em] opacity-80">
                  Binly
                </div>
                <div className="text-[11px] uppercase tracking-[0.3em] opacity-80">
                  Wrapped
                </div>
              </div>

              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-[0.25em] opacity-80">
                  Your streak
                </div>
                <div className="mt-1 text-7xl font-display font-bold tabular-nums leading-none" data-testid="text-wrapped-streak">
                  {stats.currentStreak}
                </div>
                <div className="text-sm opacity-80 mt-1">
                  weeks · longest {stats.longestStreak}
                </div>
              </div>

              <div className="mt-7">
                <div className="text-[11px] uppercase tracking-[0.25em] opacity-80">
                  Favourite bin
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={CHAR_FOR_BIN[stats.favourite]}
                    alt={`${stats.favourite} bin`}
                    className="h-16 w-16 object-contain drop-shadow-lg"
                  />
                  <div>
                    <div className="text-2xl font-display font-bold capitalize" data-testid="text-favourite-bin">
                      {stats.favourite}
                    </div>
                    <div className="text-sm opacity-80">
                      {stats.totalCollections} collections tracked
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex-1">
                <div className="text-[11px] uppercase tracking-[0.25em] opacity-80">
                  Trophy room
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  <div className="text-2xl font-display font-bold tabular-nums" data-testid="text-wrapped-achievements">
                    {stats.earnedCount}
                  </div>
                  <div className="text-sm opacity-80">unlocked</div>
                </div>
                {stats.topAchievements.length > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {stats.topAchievements.map((a) => (
                      <li key={a.id} className="text-sm font-medium opacity-95" data-testid={`text-wrapped-ach-${a.id}`}>
                        <span className="mr-1.5">{a.emoji ?? "🏆"}</span>
                        {a.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-white/20 pt-3 text-center">
                <div className="text-sm font-display font-semibold">
                  Streaks rewarded.
                </div>
                <div className="text-sm font-display font-semibold">
                  Smugness encouraged.
                </div>
                <div className="text-[10px] uppercase tracking-[0.3em] opacity-70 mt-2">
                  binly.app
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={copyLink} className="rounded-full clay-press" data-testid="button-share-bottom">
            <Copy className="h-4 w-4 mr-2" /> Copy link to share
          </Button>
        </div>
      </main>
    </div>
  );
}
