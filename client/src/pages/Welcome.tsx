import { Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PushOptIn } from "@/components/PushOptIn";
import { Logo } from "@/components/Logo";
import { Sparkles } from "lucide-react";

export default function Welcome() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <header className="px-6 md:px-10 pt-6 max-w-6xl mx-auto">
        <Link href="/" data-testid="link-home">
          <span className="cursor-pointer inline-flex items-center" aria-label="Binly home">
            <Logo className="h-8" />
          </span>
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 md:px-10 py-10 space-y-8">
        <div>
          <div className="inline-flex items-center gap-2 text-accent">
            <Sparkles className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-wide">You're in</span>
          </div>
          <h1 className="mt-3 text-3xl md:text-4xl font-display font-semibold tracking-tight">
            One last thing — turn on bin alerts.
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Two nudges a week, max. Night before. Morning of. Nothing else, ever. Bin there, reminded that.
          </p>
        </div>

        <PushOptIn />

        <Card className="rounded-3xl p-6 bg-muted/30">
          <h2 className="text-base font-display font-semibold">Don't fancy it?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            No bother. You can switch alerts on later from Settings — they're always opt-in, always free.
          </p>
        </Card>

        <div className="flex gap-3">
          <Button
            onClick={() => navigate("/dashboard")}
            className="rounded-full clay-press"
            data-testid="button-go-dashboard"
          >
            Take me to my bins
          </Button>
        </div>
      </main>
    </div>
  );
}
