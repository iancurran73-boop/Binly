import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { BinCardSummary, CardColor } from "@shared/schema";
import { ShieldCheck, AlertTriangle, Ban, Sparkles, Loader2 } from "lucide-react";

const TONE: Record<CardColor, {
  label: string;
  blurb: string;
  long: string;
  ring: string;
  bg: string;
  fg: string;
  Icon: typeof ShieldCheck;
}> = {
  green: {
    label: "Green card.",
    blurb: "Pristine. Bin lorry's best customer.",
    long: "No tags, no warnings, no awkward conversations with the neighbours.",
    ring: "ring-[hsl(var(--card-green))]",
    bg: "bg-[hsl(var(--card-green)/.10)]",
    fg: "text-[hsl(var(--card-green))]",
    Icon: ShieldCheck,
  },
  yellow: {
    label: "Yellow card.",
    blurb: "We've all been there.",
    long: "Council's leaving you a polite warning. Bin still emptied. Lid down. Reflect.",
    ring: "ring-[hsl(var(--card-yellow))]",
    bg: "bg-[hsl(var(--card-yellow)/.15)]",
    fg: "text-[hsl(var(--card-yellow))]",
    Icon: AlertTriangle,
  },
  red: {
    label: "Red card.",
    blurb: "Bin not getting emptied.",
    long: "Three strikes in a fortnight. Lorry rolls past. Reflect, sort it, try again.",
    ring: "ring-[hsl(var(--card-red))]",
    bg: "bg-[hsl(var(--card-red)/.12)]",
    fg: "text-[hsl(var(--card-red))]",
    Icon: Ban,
  },
};

export function BinCards({ compact = false }: { compact?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [item, setItem] = useState("");

  const { data: summary } = useQuery<BinCardSummary>({
    queryKey: ["/api/cards"],
  });

  const confess = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/cards/confess", {
      reason: reason.trim() || null,
      item_name: item.trim() || null,
    })).json(),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/cards"] });
      qc.invalidateQueries({ queryKey: ["/api/achievements"] });
      setOpen(false);
      setReason("");
      setItem("");
      const isRed = data?.card_color === "red";
      toast({
        title: isRed ? "Red card. Brutal." : "Yellow card. Filed.",
        description: isRed
          ? "Bin not getting emptied. Reset to green after 7 clean days."
          : "We've all been there. Don't make it three.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Couldn't file it", description: err.message, variant: "destructive" }),
  });

  const clear = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/cards/clear")).json(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/cards"] });
      qc.invalidateQueries({ queryKey: ["/api/achievements"] });
      toast({
        title: "Back to green.",
        description: "Kerb-side redemption. Smug nod authorised.",
      });
    },
    onError: (err: any) =>
      toast({ title: "Not yet", description: err.message, variant: "destructive" }),
  });

  const current = summary?.current ?? "green";
  const tone = TONE[current];
  const Icon = tone.Icon;

  return (
    <>
      <Card className={`rounded-3xl p-6 ${tone.ring} ring-1`} data-testid="card-bin-cards">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-2xl ${tone.bg} ${tone.fg} grid place-items-center shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <h3 className="text-xl font-display font-semibold">Bin score</h3>
              <span className={`text-xs uppercase tracking-wider font-semibold ${tone.fg}`}>
                {tone.label.replace(".", "")}
              </span>
            </div>

            <p className="mt-1 text-base font-display font-semibold leading-snug">
              {tone.blurb}
            </p>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {tone.long}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Stat label="Yellow" value={summary?.yellow_count ?? 0} accent="text-[hsl(var(--card-yellow))]" />
              <Stat label="Red" value={summary?.red_count ?? 0} accent="text-[hsl(var(--card-red))]" />
              <Stat label="Recent" value={summary?.recent.length ?? 0} accent="text-foreground" />
            </div>

            {!compact && (
              <p className="mt-4 text-xs text-muted-foreground italic">
                In the wild this comes from the bin lorry crew, not us. From 31 Mar 2026 wrong-bin
                contamination can carry a £150–£400 Fixed Penalty Notice. {" "}
                <Link href="/rules">
                  <span className="underline decoration-dotted cursor-pointer hover:text-foreground" data-testid="link-rules-from-cards">
                    The Rules
                  </span>
                </Link>
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full clay-press"
                onClick={() => setOpen(true)}
                data-testid="button-confess-card"
              >
                I made a bin mistake
              </Button>
              {current !== "green" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full clay-press"
                  onClick={() => clear.mutate()}
                  disabled={clear.isPending}
                  data-testid="button-clear-card"
                >
                  {clear.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Earn green back
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">Right then. What did you bin?</DialogTitle>
            <DialogDescription>
              Self-tagging is character-building. Three yellows in 14 days = red.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="confess-item" className="text-sm">The item</Label>
              <Input
                id="confess-item"
                placeholder="e.g. Pizza box. Banana skin. The whole nappy."
                value={item}
                onChange={(e) => setItem(e.target.value)}
                className="mt-1.5 rounded-2xl"
                data-testid="input-confess-item"
              />
            </div>
            <div>
              <Label htmlFor="confess-reason" className="text-sm">What happened? (optional)</Label>
              <Textarea
                id="confess-reason"
                placeholder="Wrong bin. Was tired. Brain fog. The cat watched."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1.5 rounded-2xl"
                rows={3}
                data-testid="input-confess-reason"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="rounded-full"
              data-testid="button-cancel-confess"
            >
              Never mind
            </Button>
            <Button
              onClick={() => confess.mutate()}
              disabled={confess.isPending}
              className="rounded-full clay-press"
              data-testid="button-submit-confess"
            >
              {confess.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              File the card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-2xl bg-card-border/30 px-3 py-2">
      <div className={`text-2xl font-display font-bold tabular-nums ${accent}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
