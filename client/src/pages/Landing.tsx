import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import binsHero from "@/assets/char-quartet-hero.png";
import charGeneral from "@/assets/char-general.png";
import charRecycling from "@/assets/char-recycling.png";
import charGarden from "@/assets/char-garden.png";
import charFood from "@/assets/bin-food.png";
import { Bell, Search, Trophy, ShieldCheck, Sparkles, Users, Scale, AlertTriangle } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-6 md:px-10 pt-8 flex items-center justify-between max-w-6xl mx-auto">
        <div className="text-foreground">
          <Logo className="h-8" />
        </div>
        <Link href="/onboard">
          <Button data-testid="button-header-cta" className="rounded-full clay-press">
            Sort my bins
          </Button>
        </Link>
      </header>

      <section className="max-w-6xl mx-auto px-6 md:px-10 pt-12 md:pt-20 pb-10 grid md:grid-cols-2 gap-10 md:gap-16 items-center">
        <div>
          <span className="inline-block text-sm font-medium px-3 py-1 rounded-full bg-accent/10 text-accent border border-accent/20" data-testid="badge-tagline">
            Binfluencer chaos · with substance.
          </span>
          <h1 className="mt-4 text-5xl md:text-6xl lg:text-7xl font-display font-semibold leading-[0.95] tracking-tight">
            The end of the <span className="text-primary">binfluencer.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-xl leading-relaxed">
            Binly tells you which of your <span className="text-foreground font-medium">four bins</span> to drag out, when to drag it,
            and what's actually allowed inside. Food caddy included. Fixed penalties dodged. No more council website
            archaeology. No more pizza box paradox. Wheelie good.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/onboard">
              <Button size="lg" className="rounded-full clay-press text-base px-7 h-12" data-testid="button-hero-cta">
                Sort my bins
              </Button>
            </Link>
            <Link href="/onboard">
              <Button size="lg" variant="outline" className="rounded-full clay-press text-base px-7 h-12" data-testid="button-hero-secondary">
                Show me the chaos
              </Button>
            </Link>
          </div>
          <p className="mt-5 text-sm text-muted-foreground">
            Always free · Streaks rewarded. Smugness encouraged. Binnovation included.
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 -z-10 blur-3xl opacity-40 bg-gradient-to-tr from-primary/30 via-accent/20 to-transparent rounded-full" />
          <img
            src={binsHero}
            alt="Four claymation wheelie bins — black general, teal recycling, brown food caddy, sage garden — lined up for a group photo"
            className="rounded-3xl shadow-xl w-full clay-wobble-slow"
            data-testid="img-hero"
          />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-24">
        <h2 className="text-3xl md:text-4xl font-display font-semibold tracking-tight max-w-2xl">
          Your weekly bin schedule. Quietly heroic.
        </h2>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Bin there, done that. Then double-checked it. Then made it funny. Binnovation at its finest.
        </p>
        <div className="mt-10 grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Bell className="h-5 w-5" />}
            title="Your weekly schedule"
            body="The binnovator pulls your council's bin calendar so you don't have to. Knows exactly which wheelie bin lands at YOUR address, every week. Food caddy included."
          />
          <FeatureCard
            icon={<Scale className="h-5 w-5" />}
            title="The Rules, demystified"
            body="From 31 March 2026, every English home gets a food caddy and the wrong rubbish in the wrong bin can mean a £150–£400 fine. We translate the policy into plain English with jokes."
          />
          <FeatureCard
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Yellow & red cards"
            body="Councils are tagging contaminated bins. Two yellows in a fortnight escalates to a red. Confess your sin in-app, get coached back to a clean sheet, dodge the fine."
          />
          <FeatureCard
            icon={<Search className="h-5 w-5" />}
            title="Pizza box paradox: solved"
            body="Type 'pizza box', 'yoghurt pot', 'banana skin', 'glass jar with that one bit of label still on it'. Get the right bin, with the awkward truths attached."
          />
          <FeatureCard
            icon={<Trophy className="h-5 w-5" />}
            title="Bin streaks"
            body="A gentle little game with stupidly high stakes. Mark your bin out. Keep the streak. Earn the absurdly cherished BIN YEAR badge."
          />
          <FeatureCard
            icon={<Users className="h-5 w-5" />}
            title="Flatmate flair"
            body="Invite the household. One person remembering bin day for everyone? That's a war crime. Share the load. Share the smugness."
          />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 md:px-10 py-12 md:py-20">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
          <h2 className="text-2xl md:text-3xl font-display font-semibold tracking-tight">Meet the cast.</h2>
          <Link href="/rules">
            <Button variant="outline" className="rounded-full clay-press" data-testid="button-rules-link">Read The Rules 2026</Button>
          </Link>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
          {[
            { src: charGeneral, name: "General", quote: "I am the lid of last resort." },
            { src: charRecycling, name: "Recycling", quote: "Rinse it. Squish it. Love it." },
            { src: charFood, name: "Food caddy", quote: "Banana skins to bones. The lot." },
            { src: charGarden, name: "Garden", quote: "I eat your hedge clippings. Respectfully." },
          ].map((c) => (
            <div key={c.name} className="rounded-3xl bg-card border border-card-border p-6 shadow-sm hover-elevate transition-shadow">
              <img src={c.src} alt={c.name} className="h-44 w-full object-contain clay-wobble-slow" />
              <div className="mt-4 text-sm uppercase tracking-wider text-muted-foreground">{c.name} bin</div>
              <div className="text-lg font-display font-semibold">"{c.quote}"</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 md:px-10 py-16 text-center">
        <Sparkles className="h-6 w-6 mx-auto text-accent" />
        <h2 className="mt-3 text-3xl md:text-4xl font-display font-semibold tracking-tight">
          Don't talk rubbish. Take it out.
        </h2>
        <p className="mt-4 text-muted-foreground">
          361 UK councils ready to roll. Pick yours, get your schedule, dodge the fixed penalty, build a streak.
        </p>
        <Link href="/onboard">
          <Button size="lg" className="mt-6 rounded-full clay-press text-base px-7 h-12" data-testid="button-bottom-cta">
            Start sorting
          </Button>
        </Link>
      </section>

      <footer className="border-t border-border/60 mt-10">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row gap-3 justify-between items-center text-sm text-muted-foreground">
          <span>© Binly. Made with clay, care and a slightly unhealthy interest in lid hinges.</span>
          <span>Powered by the binnovator · Always free · Web today, iOS &amp; Android next.</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-card border border-card-border rounded-3xl p-6 hover-elevate transition-shadow shadow-sm">
      <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary grid place-items-center">
        {icon}
      </div>
      <h3 className="mt-4 text-xl font-display font-semibold">{title}</h3>
      <p className="mt-2 text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}
