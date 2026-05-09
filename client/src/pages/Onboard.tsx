import { useState, useMemo, useEffect, useRef } from "react";
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
import { Loader2, ArrowRight, Sparkles, Check, ChevronsUpDown, Hourglass, ExternalLink, Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import binsHero from "@/assets/char-quartet-hero.png";

export default function Onboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [postcode, setPostcode] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [councilId, setCouncilId] = useState<string | undefined>(undefined);
  const [councilWasAutoDetected, setCouncilWasAutoDetected] = useState(false);
  const [comboOpen, setComboOpen] = useState(false);
  const [waitlistDone, setWaitlistDone] = useState(false);
  const [uprn, setUprn] = useState("");
  const [paon, setPaon] = useState("");

  // Address lookup state — user types postcode, hits "Find my address", picks
  // from the dropdown. UPRN + PAON get auto-populated behind the scenes.
  type LookupAddress = {
    label: string;
    uprn: string;
    paon: string;
    line_1: string;
    line_2: string;
    post_town: string;
    postcode: string;
  };
  const [addressOptions, setAddressOptions] = useState<LookupAddress[]>([]);
  const [addressLookupLoading, setAddressLookupLoading] = useState(false);
  const [addressLookupError, setAddressLookupError] = useState<string | null>(null);
  const [selectedAddressIdx, setSelectedAddressIdx] = useState<number | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  // Default ON because the Bulletin is genuinely useful (recycling rules,
  // seasonal tips, dry humour) and the box is visible — not hidden in a 9pt
  // footer. Users see it, can untick it, and unsubscribe one-click later.
  const [bulletinOptIn, setBulletinOptIn] = useState(true);

  // Auto-fire address lookup ~400ms after the user finishes typing a valid
  // postcode. Keeps the flow conversational — they don't have to hunt for a
  // "Find my address" button. UK postcode regex is permissive: 1-2 letters,
  // 1 digit, optional letter/digit, then space/none, digit, 2 letters.
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runAddressLookup = async (rawPostcode: string) => {
    setAddressLookupLoading(true);
    setAddressLookupError(null);
    setAddressOptions([]);
    setSelectedAddressIdx(null);
    setUprn("");
    setPaon("");
    setAddress("");
    try {
      const r = await apiRequest(
        "GET",
        `/api/address-lookup?postcode=${encodeURIComponent(rawPostcode.trim())}`,
      );
      const data = await r.json();
      if (!r.ok) {
        setAddressLookupError(data.message || "Lookup failed.");
        setShowManualFallback(true);
      } else if (!data.addresses?.length) {
        setAddressLookupError("No addresses found for that postcode.");
        setShowManualFallback(true);
      } else {
        setAddressOptions(data.addresses);
        // Auto-pick the council if Ideal Postcodes' district matched a slug.
        if (data.detectedCouncilId) {
          setCouncilId(data.detectedCouncilId);
          setCouncilWasAutoDetected(true);
        }
      }
    } catch (e: any) {
      setAddressLookupError("Couldn't reach the address service.");
      setShowManualFallback(true);
    } finally {
      setAddressLookupLoading(false);
    }
  };

  useEffect(() => {
    const cleaned = postcode.trim().replace(/\s+/g, "").toUpperCase();
    const looksValid = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(cleaned);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (!looksValid) {
      // User is mid-type or has cleared it — wipe stale results.
      setAddressOptions([]);
      setAddressLookupError(null);
      return;
    }
    lookupTimer.current = setTimeout(() => runAddressLookup(cleaned), 350);
    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode]);

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
        household_name: undefined,
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
      navigate("/welcome");
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
    <div className="min-h-screen bg-background text-foreground pb-24">
      <header className="px-6 md:px-10 pt-6 max-w-6xl mx-auto">
        <Link href="/" data-testid="link-home">
          <span className="cursor-pointer inline-flex items-center" aria-label="Binly home"><Logo className="h-8" /></span>
        </Link>
      </header>

      <main className="max-w-6xl mx-auto px-6 md:px-10 py-6 md:py-10 grid md:grid-cols-5 gap-10">
        <div className="md:col-span-3">
          <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight">
            Tell us where you live.
          </h1>
          <p className="mt-2 text-base text-muted-foreground max-w-lg">
            Postcode in, schedule out. Food caddy included from 31 March 2026. We re-check every week. Always free.
          </p>

          <form
            className="mt-6 space-y-4 max-w-lg"
            onSubmit={(e) => {
              e.preventDefault();
              if (isWaitlist) {
                if (canWaitlist) waitlist.mutate();
              } else if (canSubmit) onboard.mutate();
            }}
          >
            {/* 1. Postcode — the single ask that drives everything */}
            <div className="space-y-2">
              <Label htmlFor="postcode">Postcode</Label>
              <div className="relative">
                <Input
                  id="postcode"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value.toUpperCase())}
                  placeholder="NE8 1HH"
                  data-testid="input-postcode"
                  className="rounded-2xl h-12 uppercase tracking-wider pr-10"
                  autoCapitalize="characters"
                  autoFocus
                />
                {addressLookupLoading && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>

            {/* 2. Address dropdown — appears the moment postcode resolves */}
            {addressOptions.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="address-select">Pick your address</Label>
                <select
                  id="address-select"
                  className="w-full rounded-2xl h-12 px-3 border border-input bg-background text-sm"
                  data-testid="select-address"
                  value={selectedAddressIdx ?? ""}
                  onChange={(e) => {
                    const idx = e.target.value === "" ? null : Number(e.target.value);
                    setSelectedAddressIdx(idx);
                    if (idx !== null) {
                      const a = addressOptions[idx];
                      setUprn(a.uprn);
                      setPaon(a.paon);
                      setAddress(a.line_1);
                    } else {
                      setUprn("");
                      setPaon("");
                      setAddress("");
                    }
                  }}
                >
                  <option value="">{addressOptions.length} addresses found…</option>
                  {addressOptions.map((a, i) => (
                    <option key={`${a.uprn}-${i}`} value={i}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 3. Council confirmation — auto-detected, with manual override */}
            {(addressLookupError || (postcode.trim().length >= 5 && addressOptions.length === 0 && !addressLookupLoading)) && (
              <p className="text-xs text-destructive">{addressLookupError || "No addresses found for that postcode."}</p>
            )}

            {selectedAddressIdx !== null && selectedCouncil && (
              <div className="rounded-2xl border border-card-border bg-muted/40 p-4 space-y-2">
                <div className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-accent mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Served by</span>{" "}
                      <span className="font-medium">{selectedCouncil.name} Council</span>
                      {isWaitlist && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">waitlist</span>
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => setComboOpen(true)}
                      className="text-xs text-muted-foreground underline hover:text-foreground mt-1"
                      data-testid="button-change-council"
                    >
                      Wrong council? Pick a different one
                    </button>
                  </div>
                </div>
                {/* Hidden popover trigger so the "wrong council?" link works */}
                <Popover open={comboOpen} onOpenChange={setComboOpen}>
                  <PopoverTrigger asChild><span className="sr-only">council picker</span></PopoverTrigger>
                  <PopoverContent className="w-[320px] p-0 rounded-2xl" align="start">
                    <Command shouldFilter>
                      <CommandInput placeholder="Type your council, town or borough…" data-testid="input-council-search" />
                      <CommandList className="max-h-72">
                        <CommandEmpty>Nothing matching. UK has a lot of councils.</CommandEmpty>
                        <CommandGroup>
                          {councils.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={`${c.name} ${c.region ?? ""}`}
                              onSelect={() => {
                                setCouncilId(c.id);
                                setCouncilWasAutoDetected(false);
                                setComboOpen(false);
                              }}
                              data-testid={`option-council-${c.id}`}
                            >
                              <Check className={`mr-2 h-4 w-4 ${councilId === c.id ? "opacity-100" : "opacity-0"}`} />
                              <span className="flex-1">{c.name}</span>
                              {c.data_strategy === "waitlist" && (
                                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">waitlist</span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* 3b. Council picker fallback — if address lookup failed entirely */}
            {!selectedCouncil && addressOptions.length === 0 && (addressLookupError || showManualFallback) && (
              <div className="space-y-2">
                <Label>Council (manual)</Label>
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
                      <span className="text-muted-foreground">Search 361 UK councils…</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0 rounded-2xl" align="start">
                    <Command shouldFilter>
                      <CommandInput placeholder="Type your council, town or borough…" />
                      <CommandList className="max-h-72">
                        <CommandEmpty>Nothing matching.</CommandEmpty>
                        <CommandGroup>
                          {councils.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={`${c.name} ${c.region ?? ""}`}
                              onSelect={() => { setCouncilId(c.id); setComboOpen(false); }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${councilId === c.id ? "opacity-100" : "opacity-0"}`} />
                              <span className="flex-1">{c.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* 4. Manual UPRN/PAON fallback — only when address lookup couldn't find them */}
            {!isWaitlist && selectedCouncil && (needsUprn || needsHouseNumber) && (showManualFallback || addressLookupError) && addressOptions.length === 0 && (
              <div className="space-y-2 rounded-2xl border border-card-border p-4">
                <p className="text-xs text-muted-foreground">Couldn't find your address automatically. Enter manually:</p>
                {needsUprn && (
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={uprn}
                    onChange={(e) => setUprn(e.target.value.replace(/\D/g, ""))}
                    placeholder="UPRN (e.g. 100012345678)"
                    data-testid="input-uprn"
                    className="rounded-2xl h-10 tabular-nums"
                  />
                )}
                {needsHouseNumber && (
                  <Input
                    value={paon}
                    onChange={(e) => setPaon(e.target.value)}
                    placeholder="House number or name"
                    data-testid="input-paon"
                    className="rounded-2xl h-10"
                  />
                )}
                {needsUprn && (
                  <p className="text-xs text-muted-foreground">
                    Look up your UPRN at <a href={`https://www.getthedata.com/uprn-search/${encodeURIComponent(postcode.trim().replace(/\s/g, ""))}`} target="_blank" rel="noopener noreferrer" className="underline">GetTheData<ExternalLink className="h-3 w-3 inline ml-0.5" /></a>.
                  </p>
                )}
              </div>
            )}

            {/* 5. Email — asked LAST, after they've seen the lookup work */}
            {(selectedCouncil || isWaitlist) && (
              <div className="space-y-2 pt-2">
                <Label htmlFor="email">Email for bin nudges</Label>
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
                    Send me the <strong className="text-foreground font-medium">Binly Bulletin</strong> — a short weekly email about recycling rules, seasonal bin chaos, and the occasional good deal. No spam, one-click unsubscribe.
                  </span>
                </label>
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
