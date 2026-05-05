import { useState, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Logo } from "@/components/Logo";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Council } from "@shared/schema";
import { Loader2, ArrowRight, Sparkles, Check, ChevronsUpDown, Hourglass, ExternalLink } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import binsHero from "@/assets/char-quartet-hero.png";

export default function Onboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [postcode, setPostcode] = useState("");
  const [address, setAddress] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [email, setEmail] = useState("");
  const [councilId, setCouncilId] = useState<string | undefined>(undefined);
  const [comboOpen, setComboOpen] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [uprn, setUprn] = useState("");
  const [paon, setPaon] = useState("");
  // Default ON because the Bulletin is genuinely useful (recycling rules,
  // seasonal tips, dry humour) and the box is visible — not hidden in a 9pt
  // footer. Users see it, can untick it, and unsubscribe one-click later.
  const [bulletinOptIn, setBulletinOptIn] = useState(true);

  const { data: councils = [] } = useQuery<Council[]>({ queryKey: ["/api/councils"] });

  const selectedCouncil = useMemo(
    () => councils.find((c) => c.id === councilId),
    [councils, councilId]
  );
  // A council is on the waitlist if Supabase flagged it that way OR if our
  // upstream index doesn't yet support it (e.g. Selenium-only adapters that
  // we'll ship in Phase B). Either way — honest empty state, take the email.
  const isWaitlist =
    selectedCouncil?.data_strategy === "waitlist" ||
    selectedCouncil?.requirements?.supported === false;
  const needsUprn = selectedCouncil?.requirements?.needs_uprn === true;
  const needsHouseNumber = selectedCouncil?.requirements?.needs_house_number === true;

  const onboard = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/onboard", {
        postcode: postcode.trim(),
        address_line: address.trim() || undefined,
        household_name: householdName.trim() || undefined,
        council_id: councilId,
        email: email.trim(),
        uprn: uprn.trim() || undefined,
        paon: paon.trim() || undefined,
        bulletin_opt_in: bulletinOptIn,
      });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/household"] });
      qc.invalidateQueries({ queryKey: ["/api/collections"] });
      qc.invalidateQueries({ queryKey: ["/api/streak"] });
      navigate("/dashboard");
    },
    onError: (err: any) => {
      toast({ title: "Bin lorry's gone sideways", description: err.message, variant: "destructive" });
    },
  });

  const waitlist = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/waitlist", {
        email: email.trim(),
        council_id: councilId,
        postcode: postcode.trim(),
      });
      return res.json();
    },
    onSuccess: () => {
      setWaitlistDone(true);
      toast({ title: "You're on the list", description: "We'll yell when your council ships." });
    },
    onError: (err: any) =>
      toast({ title: "Couldn't add you", description: err.message, variant: "destructive" }),
  });

  const uprnOk = !needsUprn || /^\d{8,12}$/.test(uprn.trim());
  const paonOk = !needsHouseNumber || paon.trim().length >= 1;
  const canSubmit =
    postcode.length >= 5 &&
    councilId &&
    !isWaitlist &&
    email.includes("@") &&
    uprnOk &&
    paonOk &&
    !onboard.isPending;
  const canWaitlist = email.includes("@") && councilId && !waitlist.isPending;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-6 md:px-10 pt-8 max-w-6xl mx-auto">
        <Link href="/" data-testid="link-home">
          <span className="cursor-pointer inline-flex items-center" aria-label="Binly home"><Logo className="h-8" /></span>
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-16 grid md:grid-cols-5 gap-10">
        <div className="md:col-span-3">
          <h1 className="text-4xl md:text-5xl font-display font-semibold tracking-tight">
            Tell us where you live.
          </h1>
          <p className="mt-3 text-lg text-muted-foreground max-w-lg">
            Pop your postcode in. We'll work out your schedule for all four bins (food caddy included from 31 March 2026) and double-check it every week. Always free.
          </p>

          <form
            className="mt-8 space-y-5 max-w-lg"
            onSubmit={(e) => {
              e.preventDefault();
              if (isWaitlist) {
                if (canWaitlist) waitlist.mutate();
              } else if (canSubmit) onboard.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email (for bin nudges)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.co.uk"
                data-testid="input-email"
                className="rounded-2xl h-12"
              />
              <label className="flex items-start gap-3 pt-2 cursor-pointer select-none" data-testid="label-bulletin-opt-in">
                <Checkbox
                  id="bulletin"
                  checked={bulletinOptIn}
                  onCheckedChange={(v) => setBulletinOptIn(v === true)}
                  className="mt-0.5"
                  data-testid="checkbox-bulletin"
                />
                <span className="text-sm text-muted-foreground leading-snug">
                  Send me the <strong className="text-foreground font-medium">Binly Bulletin</strong> — a short, useful weekly email about recycling rules, seasonal bin chaos, and the occasional good deal we've found. No spam, no tracking pixels, one-click unsubscribe. We won't share your email with anyone.
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="postcode">Postcode</Label>
              <Input
                id="postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                placeholder="NE8 1HH"
                data-testid="input-postcode"
                className="rounded-2xl h-12 uppercase tracking-wider"
                autoCapitalize="characters"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address (optional, for the dashboard)</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="42 Acacia Avenue"
                data-testid="input-address"
                className="rounded-2xl h-12"
              />
            </div>

            <div className="space-y-2">
              <Label>Council</Label>
              <Popover open={comboOpen} onOpenChange={setComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={comboOpen}
                    className="w-full h-12 rounded-2xl justify-between text-left font-normal"
                    data-testid="button-council-combobox"
                  >
                    {selectedCouncil ? (
                      <span className="truncate">{selectedCouncil.name}</span>
                    ) : (
                      <span className="text-muted-foreground">Search 361 UK councils…</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[--radix-popover-trigger-width] p-0 rounded-2xl"
                  align="start"
                >
                  <Command shouldFilter>
                    <CommandInput placeholder="Type your council, town or borough…" data-testid="input-council-search" />
                    <CommandList className="max-h-72">
                      <CommandEmpty>
                        Nothing matching. UK has a lot of councils. Try the borough.
                      </CommandEmpty>
                      <CommandGroup>
                        {councils.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.name} ${c.region ?? ""}`}
                            onSelect={() => {
                              setCouncilId(c.id);
                              setComboOpen(false);
                            }}
                            data-testid={`option-council-${c.id}`}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                councilId === c.id ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            <span className="flex-1">{c.name}</span>
                            {c.data_strategy === "waitlist" && (
                              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                                waitlist
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                361 councils loaded. Pilot councils run live — others join the waitlist.
              </p>
            </div>

            {!isWaitlist && needsUprn && (
              <div className="space-y-2">
                <Label htmlFor="uprn">UPRN (Unique Property Reference)</Label>
                <Input
                  id="uprn"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={uprn}
                  onChange={(e) => setUprn(e.target.value.replace(/\D/g, ""))}
                  placeholder="100012345678"
                  data-testid="input-uprn"
                  className="rounded-2xl h-12 tabular-nums"
                />
                <p className="text-xs text-muted-foreground">
                  {selectedCouncil?.name} needs your UPRN to look up your bins. It's an 8–12 digit number tied to your address.{" "}
                  <a
                    href={`https://www.findmyaddress.co.uk/search?postcode=${encodeURIComponent(postcode.trim())}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-4 inline-flex items-center gap-1 text-foreground"
                    data-testid="link-find-uprn"
                  >
                    Find my UPRN <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  — search your postcode, click your address, copy the UPRN, paste it back here.
                </p>
              </div>
            )}

            {!isWaitlist && needsHouseNumber && (
              <div className="space-y-2">
                <Label htmlFor="paon">House number or name</Label>
                <Input
                  id="paon"
                  value={paon}
                  onChange={(e) => setPaon(e.target.value)}
                  placeholder="42"
                  data-testid="input-paon"
                  className="rounded-2xl h-12"
                />
                <p className="text-xs text-muted-foreground">
                  {selectedCouncil?.name} matches addresses by house number plus postcode. Just the number (or name) — no street.
                </p>
              </div>
            )}

            {!isWaitlist && (
              <div className="space-y-2">
                <Label htmlFor="household">Household nickname (optional)</Label>
                <Input
                  id="household"
                  value={householdName}
                  onChange={(e) => setHouseholdName(e.target.value)}
                  placeholder="The Curran Compound"
                  data-testid="input-household"
                  className="rounded-2xl h-12"
                />
              </div>
            )}

            {isWaitlist ? (
              waitlistDone ? (
                <div className="rounded-2xl border border-accent/30 bg-accent/10 p-5">
                  <div className="flex gap-3 items-start">
                    <Hourglass className="h-5 w-5 text-accent mt-0.5" />
                    <div>
                      <p className="font-medium">You're on the list.</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        We'll holler the second {selectedCouncil?.name} goes live. In the meantime, breathe in deeply through your nose.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-card-border bg-muted/40 p-5 space-y-3">
                  <div className="flex gap-3 items-start">
                    <Hourglass className="h-5 w-5 text-accent mt-0.5" />
                    <div>
                      <p className="font-medium">{selectedCouncil?.name} isn't live yet.</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        We don't auto-pull the schedule for {selectedCouncil?.name} just yet. Drop your email and we'll yell when we do.
                      </p>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={!canWaitlist}
                    data-testid="button-join-waitlist"
                    className="rounded-full clay-press h-12 px-7 text-base"
                  >
                    {waitlist.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding you…</>
                    ) : (
                      <>Join the waitlist <ArrowRight className="h-4 w-4 ml-2" /></>
                    )}
                  </Button>
                </div>
              )
            ) : (
              <Button
                type="submit"
                size="lg"
                disabled={!canSubmit}
                data-testid="button-submit-onboarding"
                className="rounded-full clay-press h-12 px-7 text-base"
              >
                {onboard.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Rummaging through the council site…</>
                ) : (
                  <>Find my bins <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
            )}
          </form>
        </div>

        <aside className="md:col-span-2">
          <div className="rounded-3xl overflow-hidden shadow-md border border-card-border">
            <img src={binsHero} alt="Four clay bins, faintly judging you" className="w-full" />
          </div>
          <div className="mt-6 bg-card border border-card-border rounded-3xl p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="text-foreground font-medium">The binnovator, on duty.</span>{" "}
                Our engine re-checks your council every week. If your collection day moves, you'll know before your neighbours do. Bin there, double-checked that.
              </p>
            </div>
          </div>
          <div className="mt-4 bg-card border border-card-border rounded-3xl p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-accent mt-0.5 shrink-0" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                <span className="text-foreground font-medium">New for 2026.</span>{" "}
                Food caddy is mandatory across England. Wrong rubbish in the wrong bin can mean a £150–£400 fixed penalty and a yellow card on your bin. We'll keep you on the right side of all of it.
              </p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
