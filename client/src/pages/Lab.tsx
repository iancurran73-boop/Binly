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
import { ChevronUp, Lightbulb, Sparkles, Hammer, CheckCircle2, FlaskConical } from "lucide-react";

interface Idea {
  id: string;
  title: string;
  body: string | null;
  status: "open" | "planned" | "building" | "shipped" | "wont_do";
  upvotes: number;
  curated: boolean;
  submitted_by_name: string | null;
  voted: boolean;
}

const STATUS_META: Record<Idea["status"], { label: string; icon: any; cls: string }> = {
  open: { label: "On the bench", icon: Lightbulb, cls: "bg-muted text-muted-foreground" },
  planned: { label: "Up next", icon: Sparkles, cls: "bg-accent/15 text-accent" },
  building: { label: "In the lab", icon: Hammer, cls: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" },
  shipped: { label: "Shipped", icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  wont_do: { label: "Parked", icon: Lightbulb, cls: "bg-muted text-muted-foreground" },
};

export default function Lab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [name, setName] = useState("");

  const { data, isLoading } = useQuery<{ ideas: Idea[] }>({ queryKey: ["/api/ideas"] });
  const ideas = data?.ideas ?? [];

  const submit = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/ideas", {
        title: title.trim(),
        body: body.trim() || undefined,
        name: name.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ideas"] });
      setTitle("");
      setBody("");
      toast({ title: "Logged.", description: "Cheers, binnovator. We're on it." });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't log it", description: err.message, variant: "destructive" });
    },
  });

  const vote = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/ideas/${id}/vote`, {});
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/ideas"] });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't vote", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 text-accent">
            <FlaskConical className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wide">The Binnovator's Lab</span>
          </div>
          <h1 className="mt-3 text-xl md:text-xl font-display font-semibold tracking-tight" data-testid="text-page-title">
            What should we cook up next?
          </h1>
          <p className="mt-3 text-muted-foreground">
            Half the good ideas come from you lot. Drop a thought, vote on what's already brewing, and watch us
            tinker. Bin there, listened that.
          </p>
        </div>

        <Card className="rounded-3xl p-6">
          <h2 className="text-lg font-display font-semibold">Got a binnovation?</h2>
          <p className="text-sm text-muted-foreground mt-1">Short and sweet. We'll do the rest.</p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim().length >= 3) submit.mutate();
            }}
          >
            <div>
              <Label htmlFor="idea-title">Your idea</Label>
              <Input
                id="idea-title"
                placeholder="e.g. SMS alerts for my mum (she doesn't do apps)"
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1"
                data-testid="input-idea-title"
              />
            </div>
            <div>
              <Label htmlFor="idea-body">A bit more (optional)</Label>
              <textarea
                id="idea-body"
                placeholder="Why it'd help, when you'd use it, anything else."
                value={body}
                maxLength={1000}
                onChange={(e) => setBody(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-card-border bg-background p-3 text-sm min-h-[80px]"
                data-testid="input-idea-body"
              />
            </div>
            <div>
              <Label htmlFor="idea-name">Your name (optional)</Label>
              <Input
                id="idea-name"
                placeholder="So we can credit you if we ship it"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
                data-testid="input-idea-name"
              />
            </div>
            <Button
              type="submit"
              disabled={submit.isPending || title.trim().length < 3}
              className="rounded-full clay-press"
              data-testid="button-submit-idea"
            >
              {submit.isPending ? "Sending…" : "Send it in"}
            </Button>
          </form>
        </Card>

        <div>
          <h2 className="text-lg font-display font-semibold mb-4">On the bench</h2>
          {isLoading && <p className="text-sm text-muted-foreground">Rummaging through the ideas pile…</p>}
          <ul className="space-y-3">
            {ideas.map((idea) => {
              const meta = STATUS_META[idea.status];
              const StatusIcon = meta.icon;
              return (
                <li key={idea.id}>
                  <Card className="rounded-2xl p-4 flex items-start gap-4" data-testid={`idea-${idea.id}`}>
                    <button
                      onClick={() => vote.mutate(idea.id)}
                      disabled={vote.isPending}
                      className={`flex flex-col items-center justify-center h-14 w-12 rounded-xl border transition-colors clay-press ${
                        idea.voted
                          ? "border-accent bg-accent/15 text-accent"
                          : "border-card-border bg-muted/40 text-muted-foreground hover:border-accent/50 hover:text-accent"
                      }`}
                      data-testid={`button-vote-${idea.id}`}
                      aria-label={idea.voted ? "Retract vote" : "Upvote"}
                    >
                      <ChevronUp className="h-4 w-4" />
                      <span className="text-xs font-semibold mt-0.5">{idea.upvotes}</span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-medium">{idea.title}</h3>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>
                          <StatusIcon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </div>
                      {idea.body && <p className="mt-1 text-sm text-muted-foreground">{idea.body}</p>}
                      {idea.submitted_by_name && (
                        <p className="mt-2 text-xs text-muted-foreground">— {idea.submitted_by_name}</p>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>

        <Card className="rounded-3xl p-6 bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Not seeing your idea above?{" "}
            <Link href="/dashboard">
              <span className="text-accent font-medium cursor-pointer">Back to your bins</span>
            </Link>
            {" "}— we'll keep the bench stocked.
          </p>
        </Card>
      </main>
    </div>
  );
}
