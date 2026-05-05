import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import type { Achievement, EarnedAchievement } from "@shared/schema";
import { Trophy, Lock } from "lucide-react";

interface AchievementsResponse {
  catalog: Achievement[];
  earned: EarnedAchievement[];
}

const RARITY_STYLES: Record<string, string> = {
  common: "bg-muted text-muted-foreground border-border",
  rare: "bg-accent/10 text-accent border-accent/30",
  epic: "bg-primary/10 text-primary border-primary/30",
  legendary:
    "bg-gradient-to-r from-yellow-200/20 to-orange-300/20 text-orange-800 dark:text-orange-200 border-orange-400/40",
};

const TRIGGER_TEASER: Record<string, (val: number | null) => string> = {
  streak: (v) => `Keep a streak of ${v ?? "?"} weeks.`,
  lookup_count: (v) => `Look up ${v ?? "?"} item${(v ?? 0) > 1 ? "s" : ""}.`,
  specific_item: () => "Look up a specific item.",
  time_of_day: () => "Mark a bin out at a suspicious hour.",
  share: () => "Invite a flatmate.",
  horoscope: () => "Read your bin horoscope.",
};

function teaser(a: Achievement): string {
  const fn = TRIGGER_TEASER[a.trigger_type];
  return fn ? fn(a.trigger_value) : "Hidden trigger. Keep binning.";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function Achievements() {
  const { data, isLoading } = useQuery<AchievementsResponse>({
    queryKey: ["/api/achievements"],
  });

  const earnedMap = new Map<string, EarnedAchievement>();
  for (const e of data?.earned ?? []) earnedMap.set(e.achievement_id, e);
  const catalog = data?.catalog ?? [];

  const earnedCount = data?.earned.length ?? 0;
  const total = catalog.length;

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl md:text-xl font-display font-semibold tracking-tight" data-testid="text-page-title">
              Trophies, hard-earned.
            </h1>
            <p className="mt-3 text-muted-foreground max-w-xl">
              Streaks rewarded. Smugness encouraged. Each one's a small certificate of binning excellence.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-card border border-card-border rounded-2xl px-5 py-3 shadow-sm">
            <Trophy className="h-5 w-5 text-primary" />
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Unlocked</div>
              <div className="text-xl font-display font-semibold tabular-nums" data-testid="text-earned-count">
                {earnedCount} <span className="text-muted-foreground text-sm">/ {total}</span>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Counting your trophies…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {catalog.map((a) => {
              const earned = earnedMap.get(a.id);
              const isEarned = !!earned;
              return (
                <Card
                  key={a.id}
                  className={`rounded-3xl p-5 transition-all ${
                    isEarned ? "shadow-md" : "opacity-60 saturate-50"
                  }`}
                  data-testid={`card-achievement-${a.id}`}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`h-14 w-14 rounded-2xl grid place-items-center text-2xl shrink-0 ${
                        isEarned
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isEarned ? a.emoji ?? "🏆" : <Lock className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-semibold text-base leading-tight">
                          {a.name}
                        </h3>
                        <span
                          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            RARITY_STYLES[a.rarity] ?? RARITY_STYLES.common
                          }`}
                          data-testid={`badge-rarity-${a.id}`}
                        >
                          {a.rarity}
                        </span>
                      </div>
                      {isEarned ? (
                        <>
                          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                            {a.description}
                          </p>
                          <p className="text-xs text-accent mt-2" data-testid={`text-earned-${a.id}`}>
                            Earned {formatDate(earned!.earned_at)}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground mt-1.5 italic leading-relaxed">
                          {teaser(a)}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
