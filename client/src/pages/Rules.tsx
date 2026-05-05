import { Link } from "wouter";
import { Nav } from "@/components/Nav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BinIcon } from "@/components/BinIcon";
import { ShieldCheck, AlertTriangle, Ban, ArrowRight, ScrollText, ExternalLink } from "lucide-react";

export default function Rules() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        {/* Hero */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
            <ScrollText className="h-3.5 w-3.5" /> The Rules · 2026
          </div>
          <h1
            className="mt-3 text-2xl md:text-3xl font-display font-semibold tracking-tight leading-tight"
            data-testid="text-rules-title"
          >
            Four bins. Three card colours. One penalty regime.
          </h1>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
            From <strong className="text-foreground">31 March 2026</strong>, every English household gets a food
            caddy and stricter wrong-bin rules. We're putting the awkward facts out
            here, plainly and without hand-wringing, so you can stop getting it wrong
            and start being insufferable about it.
          </p>
        </div>

        {/* Section 1 — the four bins */}
        <section className="mt-14">
          <SectionHeader number="1" title="The four bins" />
          <p className="mt-2 text-muted-foreground max-w-2xl">
            DEFRA's <em>Simpler Recycling</em> reform standardises kerbside collections
            across England. By 31 March 2026 every household gets the same four
            streams. (Wales had it sorted years ago. Scotland and NI run their own.)
          </p>
          <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <BinCard
              kind="general"
              name="General waste"
              freq="Fortnightly"
              copy="What's left when everything else is sorted. The bin of last resort."
            />
            <BinCard
              kind="recycling"
              name="Dry recycling"
              freq="Fortnightly"
              copy="Plastic bottles, cans, paper, card, glass — rinsed, dry, no surprises."
            />
            <BinCard
              kind="garden"
              name="Garden waste"
              freq="Fortnightly"
              copy="Grass cuttings, hedge trimmings, fallen leaves. Sometimes a paid extra."
            />
            <BinCard
              kind="food"
              name="Food caddy"
              freq="Weekly"
              copy="New for 2026. Banana skins to bones — even meat and dairy. Yes, really."
              highlight
            />
          </div>
          <p className="mt-4 text-xs text-muted-foreground italic max-w-2xl">
            Source:{" "}
            <a
              href="https://www.gov.uk/government/publications/simpler-recycling-in-england-policy-update"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted hover:text-foreground"
            >
              GOV.UK – Simpler Recycling policy update
            </a>
            . The legal deadline for the food caddy rollout is 31 March 2026 for households,
            with flats getting a longer runway.
          </p>
        </section>

        {/* Section 2 — the penalty regime */}
        <section className="mt-16">
          <SectionHeader number="2" title="The fines, plainly" />
          <p className="mt-2 text-muted-foreground max-w-2xl">
            The Daily Mail headlines are technically wrong about which items, but the
            penalty regime is real. Repeated wrong-bin breaches can carry a Fixed
            Penalty Notice — a civil charge, not a criminal record.
          </p>

          <Card className="mt-6 rounded-3xl p-6 md:p-8 bg-gradient-to-br from-[hsl(var(--card-yellow)/.10)] to-[hsl(var(--card-red)/.08)]">
            <div className="grid md:grid-cols-3 gap-6">
              <Stat
                value="£150–£400"
                label="England FPN range"
                blurb="Local councils set the figure. Most start at £150, escalating with repeat issues."
              />
              <Stat
                value="£300"
                label="Wales standard FPN"
                blurb="Welsh Government sets the rate. Lower if paid early. Civil, not criminal."
              />
              <Stat
                value="0"
                label="Criminal records"
                blurb="DEFRA has confirmed FPNs are a civil penalty. They don't follow you to a job interview."
              />
            </div>
            <div className="mt-6 text-sm text-muted-foreground border-t border-border pt-4 space-y-2">
              <p>
                <strong className="text-foreground">What triggers it:</strong> persistent
                contamination of the wrong bin, repeatedly putting waste out at the wrong
                time, or refusing to follow a council's written notice.
              </p>
              <p>
                <strong className="text-foreground">What doesn't:</strong> one-off
                mistakes. The first response is almost always a yellow tag, not a fine.
              </p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground italic">
              Source:{" "}
              <a
                href="https://deframedia.blog.gov.uk/2026/01/15/inaccurate-reporting-on-fines-under-simpler-recycling/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted hover:text-foreground"
              >
                DEFRA media blog
              </a>
              {" · "}
              <a
                href="https://consult.defra.gov.uk/waste/consultation-household-waste-duty-of-care/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted hover:text-foreground"
              >
                Household duty of care consultation
              </a>
            </p>
          </Card>
        </section>

        {/* Section 3 — the card system */}
        <section className="mt-16">
          <SectionHeader number="3" title="Yellow card, red card, no card" />
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Bin lorry crews actually do this — they tag your bin with a coloured
            label rather than fine you on the spot. We've turned it into a self-tag
            game so you can practise being honest about your own contamination
            before the council gets involved.
          </p>

          <div className="mt-6 grid md:grid-cols-3 gap-4">
            <CardTier
              color="green"
              label="Green card"
              icon={<ShieldCheck className="h-6 w-6" />}
              what="No tags. Bin emptied. Move on."
              meaning="The default state. Most households, most weeks."
            />
            <CardTier
              color="yellow"
              label="Yellow card"
              icon={<AlertTriangle className="h-6 w-6" />}
              what="A polite warning sticker. Bin still emptied this time."
              meaning="The crew's flagged contamination. Sort it before the next collection."
            />
            <CardTier
              color="red"
              label="Red card"
              icon={<Ban className="h-6 w-6" />}
              what="Bin not emptied. Often a tag explaining why."
              meaning="Repeat issue. Fix the contamination, request another collection."
            />
          </div>

          <Card className="mt-6 rounded-3xl p-6 bg-card-border/30">
            <p className="text-sm">
              <strong className="text-foreground">Binnovation moment:</strong> in Binly you can self-confess a
              mistake from the dashboard. Three yellows in a fortnight = red. Seven clean days
              = back to green. Streaks rewarded. Smugness encouraged.
            </p>
          </Card>

          {/* Receipts — real councils, real numbers */}
          <div className="mt-8">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Why cards · with receipts
            </div>
            <h3 className="mt-2 text-lg md:text-xl font-display font-semibold">
              We didn't make this up. The councils did.
            </h3>
            <p className="mt-2 text-muted-foreground max-w-2xl text-sm leading-relaxed">
              Yellow stickers, red stickers, refused collections — this is the actual
              language councils use. The numbers below are from public council policy
              documents and committee reports. We've just made them less boring.
            </p>

            <div className="mt-5 grid md:grid-cols-3 gap-4">
              <Receipt
                council="Ards & North Down"
                stat="1,913"
                label="yellow recycling-alert stickers"
                blurb="Applied to grey bins in a single quarter, tracked as a published KPI in their Environment Committee minutes."
                href="https://www.ardsandnorthdown.gov.uk/media/3609/Environment-Committee-04-March-2026/pdf/ahEnvironment_Committee_04_March_2026.pdf"
                source="Environment Committee, March 2026"
              />
              <Receipt
                council="Greater Cambridgeshire"
                stat="Red sticker"
                label="= bin not emptied"
                blurb="Contaminated bins get a red sticker. Bin stays full until it's removed. Communal flats: rejected outright."
                href="https://www.scambs.gov.uk/media/dhodp0xz/gcsws-policy-document-v8-april-2025.pdf"
                source="Waste Policy 2025 (PDF)"
              />
              <Receipt
                council="Preston City"
                stat="Yellow → Red"
                label="= bin confiscated"
                blurb="Yellow sticker first, red sticker second, then the council removes the bin entirely. The escalation ladder, in stickers."
                href="https://www.bbc.co.uk/news/uk-england-lancashire-13411977"
                source="BBC News"
              />
            </div>

            <p className="mt-4 text-xs text-muted-foreground italic max-w-2xl">
              More documented examples:{" "}
              <a
                href="https://www.southlanarkshire.gov.uk/info/200156/bins_and_recycling/1845/youve_bin_tagged"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted hover:text-foreground"
              >
                South Lanarkshire “You've bin tagged”
              </a>
              {" · "}
              <a
                href="https://www.buckinghamshire.gov.uk/waste-and-recycling/bin-collections/household-waste-collection-policy-2026/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted hover:text-foreground"
              >
                Buckinghamshire 2026 policy
              </a>
              {" · "}
              <a
                href="https://democracy.durham.gov.uk/CeConvert2PDF.aspx?MID=4641&F=Report+-+Any+Other+Business+-+Progress+Report+on+the+Introduction+of+New+Policies+for+Refuse+Collection.pdf&A=1&R=0"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted hover:text-foreground"
              >
                Durham refuse policy
              </a>
            </p>
          </div>
        </section>

        {/* Section 4 — what to do */}
        <section className="mt-16">
          <SectionHeader number="4" title="What you can actually do" />
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            <DoCard
              title="Use the lookup."
              body="When in doubt, type the item. We'll tell you the right bin for your council, with the awkward truths attached."
              cta="Open the lookup"
              to="/items"
            />
            <DoCard
              title="Use the food caddy."
              body="From 31 Mar 2026 it's not optional. The good news: it takes meat, fish, dairy and bones — things home compost can't. Less smell in your general bin."
              cta="Back to the dashboard"
              to="/dashboard"
            />
            <DoCard
              title="Self-tag honestly."
              body="The Bin Cards widget on the dashboard lets you confess a mistake. Not a snitch — practice. Three yellows = red. Seven clean days back to green."
              cta="See your card"
              to="/dashboard"
            />
            <DoCard
              title="Read your council's policy."
              body="Every council writes the rules slightly differently. Check the page once, save the missed-bin link in your favourites, get on with your life."
              cta="Find your council"
              to="/onboard"
            />
          </div>
        </section>

        {/* CTA */}
        <section className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Funny on purpose. Accurate on purpose. Always free, no ads, no sponsored bins.
          </p>
          <Link href="/dashboard">
            <Button size="lg" className="mt-5 rounded-full clay-press" data-testid="button-rules-back-dashboard">
              Back to my bins <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </section>
      </main>
    </div>
  );
}

function SectionHeader({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-9 w-9 rounded-full bg-primary/10 text-primary grid place-items-center font-display font-bold text-base">
        {number}
      </span>
      <h2 className="text-xl md:text-2xl font-display font-semibold">{title}</h2>
    </div>
  );
}

function BinCard({
  kind,
  name,
  freq,
  copy,
  highlight = false,
}: {
  kind: "general" | "recycling" | "garden" | "food";
  name: string;
  freq: string;
  copy: string;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`rounded-3xl p-5 ${highlight ? "ring-2 ring-primary" : ""}`}
      data-testid={`card-rules-bin-${kind}`}
    >
      <BinIcon binType={kind} className="h-24 w-24 mx-auto" />
      <div className="mt-3 text-center">
        <div className="font-display font-semibold">{name}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-0.5">
          {freq}
        </div>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{copy}</p>
        {highlight && (
          <span className="inline-block mt-3 text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            New · 31 Mar 2026
          </span>
        )}
      </div>
    </Card>
  );
}

function Stat({ value, label, blurb }: { value: string; label: string; blurb: string }) {
  return (
    <div>
      <div className="text-3xl md:text-4xl font-display font-bold tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{blurb}</p>
    </div>
  );
}

function CardTier({
  color,
  label,
  icon,
  what,
  meaning,
}: {
  color: "green" | "yellow" | "red";
  label: string;
  icon: React.ReactNode;
  what: string;
  meaning: string;
}) {
  const tone =
    color === "green"
      ? "bg-[hsl(var(--card-green)/.10)] text-[hsl(var(--card-green))] ring-[hsl(var(--card-green))]"
      : color === "yellow"
      ? "bg-[hsl(var(--card-yellow)/.15)] text-[hsl(var(--card-yellow))] ring-[hsl(var(--card-yellow))]"
      : "bg-[hsl(var(--card-red)/.12)] text-[hsl(var(--card-red))] ring-[hsl(var(--card-red))]";

  return (
    <Card className={`rounded-3xl p-5 ring-1 ${tone}`} data-testid={`card-tier-${color}`}>
      <div className={`h-12 w-12 rounded-2xl ${tone} grid place-items-center`}>{icon}</div>
      <div className="mt-3 font-display font-semibold text-foreground">{label}</div>
      <p className="mt-1 text-sm text-foreground/90">{what}</p>
      <p className="mt-2 text-xs text-muted-foreground">{meaning}</p>
    </Card>
  );
}

function Receipt({
  council,
  stat,
  label,
  blurb,
  href,
  source,
}: {
  council: string;
  stat: string;
  label: string;
  blurb: string;
  href: string;
  source: string;
}) {
  return (
    <Card className="rounded-3xl p-5 hover-elevate transition-shadow" data-testid={`receipt-${council.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{council}</div>
      <div className="mt-2 font-display font-bold text-2xl tabular-nums leading-none">{stat}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
      <p className="mt-3 text-sm text-foreground/85 leading-relaxed">{blurb}</p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
      >
        {source} <ExternalLink className="h-3 w-3" />
      </a>
    </Card>
  );
}

function DoCard({
  title,
  body,
  cta,
  to,
}: {
  title: string;
  body: string;
  cta: string;
  to: string;
}) {
  return (
    <Card className="rounded-3xl p-6 hover-elevate transition-shadow">
      <h3 className="font-display font-semibold text-lg">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{body}</p>
      <Link href={to}>
        <Button variant="ghost" size="sm" className="mt-3 rounded-full -ml-2" data-testid={`button-do-${cta.replace(/\s+/g, '-').toLowerCase()}`}>
          {cta} <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Link>
    </Card>
  );
}
