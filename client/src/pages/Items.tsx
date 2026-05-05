import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import { BinIcon, classifyBin } from "@/components/BinIcon";
import type { ItemEntry, Council, Household } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Search, ChevronDown, ChevronUp, Lightbulb, FileText, Sparkles } from "lucide-react";

const SHREK_QUOTES = [
  "OGRES are like onions. So is your compost bin. Layers, mate.",
  "Recycling? It's all ogre when the rinse fails.",
  "Get out of my swamp — and out of my general waste, you greasy pizza box.",
];

export default function Items() {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [shrek, setShrek] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: all = [], isLoading } = useQuery<ItemEntry[]>({ queryKey: ["/api/items/all"] });
  const { data: household } = useQuery<Household | null>({ queryKey: ["/api/household"] });
  const { data: councils = [] } = useQuery<Council[]>({ queryKey: ["/api/councils"] });

  const council = councils.find((c) => c.id === household?.council_id);

  const filtered = useMemo(() => {
    if (!q.trim()) return all;
    const needle = q.toLowerCase().trim();
    return all.filter(
      (i) =>
        i.item_name.toLowerCase().includes(needle) ||
        (i.category ?? "").toLowerCase().includes(needle)
    );
  }, [q, all]);

  const handleSearchChange = (v: string) => {
    setQ(v);
    if (v.toLowerCase().includes("shrek")) {
      setShrek(SHREK_QUOTES[Math.floor(Math.random() * SHREK_QUOTES.length)]);
    } else if (shrek) {
      setShrek(null);
    }
  };

  const handleClickItem = async (it: ItemEntry) => {
    setExpanded((m) => ({ ...m, [it.id]: !m[it.id] }));
    if (!expanded[it.id]) {
      try {
        await apiRequest("POST", "/api/items/looked-up", {
          item_name: it.item_name,
          category: it.category,
        });
        qc.invalidateQueries({ queryKey: ["/api/achievements"] });
      } catch {
        /* fire-and-forget */
      }
    }
  };

  const binColorFor = (binType: string) => {
    if (!council) return undefined;
    const lower = binType.toLowerCase();
    // try exact, then partial match
    const match =
      council.bin_types?.find((b) => b.type.toLowerCase() === lower) ||
      council.bin_types?.find(
        (b) => b.type.toLowerCase().includes(lower) || lower.includes(b.type.toLowerCase())
      );
    return match?.color;
  };

  const FALLBACK_COLOR: Record<string, string> = {
    general: "#3F3D3A",
    recycling: "#1F6FB8",
    garden: "#5C3A1F",
    food: "#7A5C3F",
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <h1 className="text-xl md:text-xl font-display font-semibold tracking-tight">
          Pizza box paradox? Solved.
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          Type an item. We'll tell you which bin, with the awkward truths attached. Don't talk rubbish — bin it correctly.
        </p>

        <div className="relative mt-8 max-w-xl">
          <Search className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="pizza box, yoghurt pot, glass jar with the lid still on…"
            className="rounded-full h-14 pl-12 text-base"
            data-testid="input-search-items"
          />
        </div>

        {shrek && (
          <Card className="mt-4 rounded-3xl p-5 border-2 border-primary/40 bg-primary/5 max-w-xl">
            <p className="text-sm font-medium text-primary" data-testid="text-shrek">{shrek}</p>
          </Card>
        )}

        {isLoading ? (
          <p className="mt-10 text-muted-foreground text-sm">Loading the lookup…</p>
        ) : all.length === 0 ? (
          <p className="mt-10 text-muted-foreground">No lookup yet — set up your council first.</p>
        ) : (
          <div className="mt-10 space-y-3">
            {filtered.length === 0 && q.trim() && (
              <Card className="rounded-3xl p-6">
                <p className="text-muted-foreground">
                  Nothing in our lookup for{" "}
                  <span className="text-foreground font-medium">"{q}"</span> yet. When in doubt, the general bin is the safe (if uninspiring) bet.
                </p>
              </Card>
            )}
            {filtered.map((it) => {
              const open = !!expanded[it.id];
              const colour = it.bin_color || binColorFor(it.bin_type);
              const binKind = classifyBin(it.bin_type);
              return (
                <Card
                  key={it.id}
                  className="rounded-3xl overflow-hidden hover-elevate transition-shadow"
                  data-testid={`card-item-${it.id}`}
                >
                  <button
                    type="button"
                    className="w-full text-left px-5 py-4 flex items-center gap-4"
                    onClick={() => handleClickItem(it)}
                    data-testid={`button-toggle-item-${it.id}`}
                  >
                    <BinIcon binType={it.bin_type} className="h-12 w-12" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-semibold text-base truncate">
                          {it.item_name}
                        </span>
                        {it.category && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {it.category}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className="text-xs font-medium px-2.5 py-0.5 rounded-full text-white"
                          style={{
                            backgroundColor:
                              colour || FALLBACK_COLOR[binKind] || "#3F3D3A",
                          }}
                          data-testid={`pill-bin-${it.id}`}
                        >
                          {it.bin_type}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {binKind}
                        </span>
                      </div>
                    </div>
                    {open ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {open && (
                    <div className="px-5 pb-5 pt-1 space-y-3 border-t border-card-border">
                      {it.notes && (
                        <Detail
                          icon={<FileText className="h-4 w-4" />}
                          label="The truth"
                          body={it.notes}
                          tone="muted"
                        />
                      )}
                      {it.tip && (
                        <Detail
                          icon={<Lightbulb className="h-4 w-4" />}
                          label="Tip"
                          body={it.tip}
                          tone="accent"
                        />
                      )}
                      {it.fun_fact && (
                        <Detail
                          icon={<Sparkles className="h-4 w-4" />}
                          label="Fun fact"
                          body={it.fun_fact}
                          tone="primary"
                        />
                      )}
                      {!it.notes && !it.tip && !it.fun_fact && (
                        <p className="text-sm text-muted-foreground italic">
                          No commentary on this one. The bin speaks for itself.
                        </p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function Detail({
  icon, label, body, tone,
}: {
  icon: React.ReactNode;
  label: string;
  body: string;
  tone: "muted" | "accent" | "primary";
}) {
  const toneClasses =
    tone === "accent"
      ? "bg-accent/10 text-accent border-accent/20"
      : tone === "primary"
        ? "bg-primary/10 text-primary border-primary/20"
        : "bg-muted text-muted-foreground border-border";
  return (
    <div className="flex gap-3">
      <div className={`h-7 w-7 rounded-lg grid place-items-center border shrink-0 ${toneClasses}`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <p className="text-sm leading-relaxed text-foreground mt-0.5">{body}</p>
      </div>
    </div>
  );
}
