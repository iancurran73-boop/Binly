// Deterministic, gloriously absurd weekly bin horoscopes.
// Same household + same ISO week → same horoscope. Different week → different one.

const FORTUNES = [
  {
    headline: "The kerb is calling.",
    body: "This week, your bins ascend. A neighbour will nod at you with respect. Embrace it. Do not nod back too eagerly — keep some mystery.",
    omen: "Look out for a single rogue lid. It is testing you.",
  },
  {
    headline: "Mercury is in landfill.",
    body: "Communication with the bin lorry will be strained. Put them out 15 minutes earlier than feels reasonable. The crew respects punctuality.",
    omen: "Avoid making eye contact with magpies before 8am.",
  },
  {
    headline: "The wheelie wisdom whispers.",
    body: "Your bin streak has angels watching. A small act of recycling correctness will ripple outward. Someone, somewhere, will rinse a yoghurt pot in your honour.",
    omen: "Trust the scrunch test.",
  },
  {
    headline: "A great alignment of bins approaches.",
    body: "Two bins will go out together this week. This is rare and powerful. Photograph the moment. Tell no one.",
    omen: "Beware the rogue Amazon box hidden behind the sofa.",
  },
  {
    headline: "Saturn returns. So does the recycling.",
    body: "An old habit dies. A new one rises from the brown bin. You will, perhaps for the first time, flatten a cardboard box without complaining.",
    omen: "A flat box is a happy box.",
  },
  {
    headline: "You have been chosen.",
    body: "The universe has selected your address for an oddly clean collection day. The crew will be on time. The lorry will be quiet. You will weep softly.",
    omen: "Do not jinx it by talking about it at work.",
  },
  {
    headline: "The bin gods are amused.",
    body: "A friend will text you to ask which bin to use. Answer with confidence even if you are guessing. Your gut is now legally certified.",
    omen: "Coffee pods are not your enemy. The lid is.",
  },
  {
    headline: "Storms in the south, peace in the kerb.",
    body: "While Britain rages about the weather, your bins remain calm. You are the eye of the storm. You are the bin Buddha.",
    omen: "Wedge the lid down. Wind is coming.",
  },
  {
    headline: "A reckoning approaches.",
    body: "There is a single jar in your fridge that has been there since November. You know the one. This week is about closure.",
    omen: "Rinse twice. Recycle once. Forgive yourself.",
  },
  {
    headline: "The recycling bin is feeling smug.",
    body: "Don't engage. Just give it what it wants and move on. Smug recycling bins are very common in May.",
    omen: "If the lid won't close, you have over-recycled. Iconic.",
  },
  {
    headline: "Garden waste is in retrograde.",
    body: "A leaf has rolled across your path and is asking to come inside. Decline politely. The brown bin awaits.",
    omen: "A daisy in the garden bin is good luck. A daisy on the patio is unfinished business.",
  },
  {
    headline: "The general bin is feeling general.",
    body: "Nothing special this week. It just wants to be acknowledged. Say hello as you walk past it. It will appreciate the gesture.",
    omen: "Tied bin bag knot = household harmony.",
  },
  {
    headline: "The food caddy has entered the chat.",
    body: "From 31 March 2026 the caddy is mandatory. This week, befriend it. Banana skins. Tea bags. The quiet courage of bones.",
    omen: "A caddy lid that closes properly is the sign of a calm soul.",
  },
  {
    headline: "Liner up. Lid down.",
    body: "Compostable liner this week. The caddy will not betray you. Do not buy the cheap ones. Mercury is in own-brand cling film.",
    omen: "If you can smell it, the lid isn't on properly.",
  },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function getBinHoroscope(householdId: string) {
  const week = isoWeek(new Date());
  const idx = hashString(`${householdId}-${week}`) % FORTUNES.length;
  const fortune = FORTUNES[idx];
  // Bin of the week — same hash, different mod
  const types = ["general", "recycling", "garden", "food"] as const;
  const bin = types[hashString(`${householdId}-${week}-bin`) % types.length];
  return { week, ...fortune, binOfTheWeek: bin };
}
