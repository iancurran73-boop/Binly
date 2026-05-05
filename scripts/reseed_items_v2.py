#!/usr/bin/env python3
"""Reseed bindicator_items with food caddy support.

Wipes existing items and re-inserts the v2 catalogue (now 38 items × 361 councils).
Most food-category items now route to the new 'food' bin instead of garden/general.
"""
import json
import urllib.request
import urllib.error

SUPABASE_URL = "https://kgxvomfyvirkqhgabjel.supabase.co"
ANON_KEY = None
with open("/home/user/workspace/bindicator/.env") as f:
    for line in f:
        if line.startswith("SUPABASE_ANON_KEY="):
            ANON_KEY = line.split("=", 1)[1].strip()
            break

HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
}

# v2 catalogue — food-category items now route to 'food' caddy.
# Tea bags stay 'general' (most contain plastic), cooking oil stays 'general' (sealed bottle).
ITEMS = [
    # Tricky / classic
    ('Pizza box', 'general', 'tricky',
     'Greasy lid? General. Clean lid? Recycling.',
     'Tear the box in half. Greasy bottom in general. Clean lid in recycling.',
     'One greasy pizza box can contaminate an entire batch of recycling. The most controversial bin item in the country.'),
    ('Coffee pod (aluminium)', 'recycling', 'tricky',
     "Empty it first. Aluminium pods are recyclable; plastic ones often aren't.",
     'Pop used grounds into the food caddy, then put the empty pod in recycling.',
     'Nespresso runs a free pod recycling service via Royal Mail. They will literally come and get them.'),
    ('Coffee cup (takeaway)', 'general', 'tricky',
     'The plastic lining means most go in general waste.',
     'Costa, Pret and Greggs run in-store cup recycling. The bin you put it in matters less than the cup you bought.',
     'The UK chucks 2.5 billion takeaway coffee cups a year. Bringing your own gets you 25p off at most chains.'),

    # FOOD — moved from garden/general to food caddy
    ('Banana skin', 'food', 'food',
     'Food caddy. Weekly collection from 31 March 2026.',
     'Compost it if you can — banana skins are practically nutritional fairy dust for tomatoes.',
     'A banana skin takes 2 years to decompose in landfill. In compost, about 4 weeks.'),
    ('Egg shells', 'food', 'food',
     'Food caddy. Crush them first if you like.',
     'Crushed shells break down faster, and slugs hate crawling over the sharp edges.',
     'Egg shells are 95% calcium carbonate, the same stuff as antacid tablets. Bins love them.'),
    ('Tea bag', 'general', 'food',
     "Most tea bags contain a tiny bit of plastic — sadly general.",
     "PG Tips, Yorkshire and Twinings have moved to plastic-free. Those go in the food caddy. Check yours.",
     'A typical tea bag contains around 0.7g of plastic. Britain drinks 100 million cups a day. Do the maths.'),
    ('Coffee grounds', 'food', 'food',
     'Food caddy. Or sprinkle on the garden — slugs hate them.',
     "Don't pour them down the sink. They clog drains for fun.",
     'Coffee grounds are mildly acidic and brilliant for blueberries, hydrangeas and roses. Free fertiliser.'),
    ('Bones (cooked)', 'food', 'food',
     'Food caddy is fine in most councils. Wrap them so they don\'t leak.',
     "Raw bones too. The caddy can take them. Your dog might disagree.",
     "Bones can take centuries to decompose. The triceratops fossil hasn't. Yet."),
    ('Meat scraps', 'food', 'food',
     'Food caddy. Wrap in newspaper or a compostable liner.',
     "Meat goes in the caddy. Don't compost it at home — it attracts rats.",
     'The food caddy is taken to industrial anaerobic digestion. It can handle meat, fish and dairy that home compost can\'t.'),
    ('Fish bones / fish skin', 'food', 'food',
     'Food caddy. Yes, even the smelly bits.',
     'Wrap tightly. Future you will thank present you.',
     'UK food waste creates around 18 million tonnes of CO₂ a year. Caddy it and that drops by half.'),
    ('Dairy (cheese, yoghurt, milk)', 'food', 'food',
     'Food caddy. All of it.',
     'Pour out runny dairy first. The caddy is for solids, not soup.',
     "Dairy at industrial scale produces a lot of methane in landfill. The caddy stops that."),
    ('Cooked rice / pasta', 'food', 'food',
     'Food caddy. Even the bit that stuck to the pan.',
     'Scrape the pan straight in. No need to rinse.',
     'Around a third of food bought in UK homes is binned. Use the caddy and at least it becomes biogas.'),
    ('Citrus peels', 'food', 'food',
     'Food caddy. Lemons, limes, oranges, all welcome.',
     'Citrus peels are great for the caddy but slow in home compost — too acidic.',
     "Lemon peel oil is so flammable it's used in some natural firelighters. Bins are not."),
    ('Bread crusts / stale bread', 'food', 'food',
     'Food caddy. Even the rock-hard bits.',
     'Birds enjoy fresh bread, not stale. Put stale bread in the caddy, fresh bread on the lawn.',
     'The UK throws away 24 million slices of bread a day. That\'s about 11,000 loaves an hour.'),
    ('Vegetable peelings', 'food', 'food',
     'Food caddy or home compost — both happy.',
     'Onion skins, potato peel, carrot tops — all in. Caddy or compost, your call.',
     "A potato peel takes 2 weeks to compost. A potato itself takes 6 months. Peel first, bin smarter."),
    ('Cooking oil', 'general', 'food',
     'NEVER down the sink. Cool it, bottle it, bin it (general).',
     "Pour it back into the original bottle once cooled. Some councils run oil banks.",
     'Fatbergs are real. The Whitechapel Fatberg in 2017 was 250 metres long and weighed 130 tonnes.'),

    # Plastic
    ('Plastic bottle', 'recycling', 'plastic',
     'Always rinse and squash. Lid back on.',
     'Squashing saves about a third of bin space. The lid stays attached so it survives the sorting machines.',
     'A plastic bottle takes 450 years to decompose. Glass takes a million. Cheery.'),
    ('Plastic bag', 'general', 'plastic',
     "Most can't go in your home recycling bin.",
     "Tesco, Sainsbury's and most big supermarkets have plastic bag recycling at the door.",
     'The 5p bag charge cut plastic bag use by 95% almost overnight. Behavioural economics works.'),
    ('Cling film', 'general', 'plastic',
     "Recyclable in theory, not in your kerbside bin.",
     'Same drill as plastic bags — supermarket front-of-store recycling.',
     'The first cling film was invented by accident in 1933 when a chemist tried to make a hairspray bottle.'),
    ('Yoghurt pot', 'recycling', 'plastic',
     'Rinse it. Foil lid removed. Pot in.',
     "Most pots are PP (code 5), widely recycled. The foil lid usually isn't.",
     "Müller alone makes 1.4 billion yoghurts a year in the UK. That's a lot of pots."),
    ('Plastic film tray (ready meal)', 'recycling', 'plastic',
     "Black plastic is the controversial one. Most sorting machines can't see it.",
     "If it's black, check council guidance. Coloured trays are usually fine.",
     'Black plastic absorbs the infrared sorting machines use, so they see nothing and send it to general.'),
    ('Bubble wrap', 'general', 'plastic',
     'Same as plastic bags — supermarket front-of-store recycling.',
     "Pop it first. We won't tell anyone.",
     'Bubble wrap was originally invented in 1957 as 3D wallpaper. It flopped. Packaging revolution came later.'),

    # Paper
    ('Cardboard', 'recycling', 'paper',
     'Flatten it. Take the tape off if you can be bothered.',
     'Big boxes hide bin-day capacity. Always flatten.',
     'Recycling 1 tonne of cardboard saves about 17 trees and 4,000 kWh of electricity.'),
    ('Wrapping paper', 'general', 'paper',
     'Glittery, foily, plasticky? General. Plain? Recycling.',
     "The scrunch test. If it stays scrunched, it's recyclable. If it springs back, it's not.",
     'Britain throws away 227,000 miles of wrapping paper every Christmas. Enough to wrap the equator nine times.'),
    ('Newspaper', 'recycling', 'paper',
     'Straight in the recycling, no fuss.',
     "Don't bag it. Loose paper is happier paper.",
     'A sheet of newspaper can be recycled about 7 times before the fibres get too short.'),
    ('Greetings card', 'recycling', 'paper',
     "Plain card recycles. Glittery / musical / felt-covered ones don't.",
     'If it sings when you open it, it has a battery. Take that out first.',
     "A card with glitter is so contaminated it can't be recycled. The glitter spreads through the load."),
    ('Receipt', 'general', 'paper',
     "Thermal receipts contain BPA and can't be recycled.",
     'Ask for a digital receipt where you can. Tiny act, mildly heroic.',
     'Receipts contain bisphenol A which is harmful in recycling. Just bin them.'),

    # Glass / metal
    ('Glass bottle', 'recycling', 'glass',
     "Rinse it. Lid off (the metal lid is recycling too).",
     'Take broken glass to a bottle bank rather than your kerbside bin to keep crews safe.',
     'Glass can be recycled infinitely. The same molecule could have been a Roman wine bottle and is now your IPA.'),
    ('Drinks can', 'recycling', 'metal',
     "Squash if you can. Rinse if it's sticky.",
     'A drinks can recycled today is back on the shelf as a new can in 60 days.',
     'Recycling aluminium uses 95% less energy than making new. One can saves enough energy to power a TV for 3 hours.'),
    ('Tin can (food)', 'recycling', 'metal',
     'Rinse it out. Leave the lid attached if you can.',
     'Soup, beans, dog food — same drill. Steel cans are 100% recyclable.',
     'Steel is the most recycled material on Earth by weight. More than paper, plastic, glass and aluminium combined.'),
    ('Aerosol can', 'recycling', 'metal',
     "Empty cans only. Don't squash, don't pierce.",
     "If it still hisses, it's not empty. Use it up first.",
     "Aerosols haven't contained ozone-damaging CFCs since the late 1980s. The hole is healing nicely."),
    ('Foil (kitchen)', 'recycling', 'metal',
     "Scrunch test it — if it stays scrunched, it's aluminium. Recycle.",
     'Group small bits into a tennis-ball-sized clump so the sorters can spot it.',
     'A single piece of foil under 5cm is too small for most sorting machines. Bigger is better.'),

    # Household
    ('Toothbrush', 'general', 'household',
     'Mixed plastics, bonded bristles. Sadly general.',
     'TerraCycle runs a free toothbrush recycling programme via Colgate. Worth saving up.',
     "Roughly a billion toothbrushes are thrown away in the UK every year. They'll outlive us all."),
    ('Toothpaste tube', 'general', 'household',
     "Mixed plastic and metal layers — most aren't recyclable.",
     'Some brands (Colgate, Sensodyne) now run free recycling schemes. Check before you bin.',
     'Toothpaste tubes are typically 7 layers of mixed plastic. Engineering miracle. Recycling nightmare.'),
    ('Nappy', 'general', 'household',
     'Always general waste. Always.',
     'Bag them. Bin them. Move on.',
     'A single nappy takes 500 years to break down. The first ones are still out there.'),
    ('Light bulb (LED)', 'general', 'household',
     'NOT in recycling. Most councils have a take-back at the tip.',
     'B&Q, IKEA and Currys have free bulb recycling. Roll the old ones up in newspaper.',
     'A modern LED uses 90% less electricity than the old incandescents and lasts 25 times longer.'),
    ('Batteries', 'general', 'household',
     'NEVER in any kerbside bin. Take to a battery point.',
     "Tesco, Sainsbury's, B&Q all have battery boxes by the door. They cause bin fires if binned.",
     'Lithium battery fires in bin lorries doubled between 2019 and 2023. Real, present danger.'),

    # Garden
    ('Grass cuttings', 'garden', 'garden',
     'Garden bin or home compost.',
     "Don't bag them. Loose grass = happy compost.",
     "A lawn produces about 200kg of cuttings per year. That's a lot of free fertiliser."),
    ('Hedge trimmings', 'garden', 'garden',
     'Garden bin. Cut anything thick into shorter pieces.',
     'Branches over 4cm thick should go to the tip — your bin lorry will thank you.',
     "Hedges support over 80 species of British wildlife. Trim in winter when the birds aren't nesting."),
    ('Soil', 'general', 'garden',
     'NOT garden waste in most councils. To the tip with it.',
     'Soil is heavy and fills the bin lorry fast. Most councils ban it from kerbside.',
     'A spadeful of healthy soil contains more living organisms than there are people on Earth.'),
    ('Christmas tree', 'garden', 'garden',
     'Most councils do a January collection. Real trees only.',
     'Ditch the lights, the tinsel, and the angry cat first.',
     "About 8 million real Christmas trees are sold in the UK each year. Composted, they become next year's mulch."),
]

print(f"{len(ITEMS)} items defined")

# Wipe existing items
print("Wiping existing bindicator_items rows...")
del_url = f"{SUPABASE_URL}/rest/v1/bindicator_items?id=neq.00000000-0000-0000-0000-000000000000"
req = urllib.request.Request(del_url, headers={**HEADERS, "Prefer": "return=minimal"}, method="DELETE")
try:
    with urllib.request.urlopen(req, timeout=120) as resp:
        print(f"  Wiped (status {resp.status})")
except urllib.error.HTTPError as e:
    body = e.read().decode("utf-8", errors="replace")
    print(f"WIPE ERROR: {e.code} {body[:300]}")

# Fetch council ids
url = f"{SUPABASE_URL}/rest/v1/bindicator_councils?select=id"
req = urllib.request.Request(url, headers=HEADERS)
with urllib.request.urlopen(req, timeout=60) as resp:
    councils = json.loads(resp.read())
print(f"{len(councils)} councils")

rows = []
for c in councils:
    for (name, bin_type, category, notes, tip, fun_fact) in ITEMS:
        rows.append({
            "council_id": c["id"],
            "item_name": name,
            "bin_type": bin_type,
            "notes": notes,
            "tip": tip,
            "fun_fact": fun_fact,
            "category": category,
        })

print(f"{len(rows)} item rows to insert")

url = f"{SUPABASE_URL}/rest/v1/bindicator_items"
ins_headers = {**HEADERS, "Prefer": "return=minimal"}
batch_size = 200
total = 0
for i in range(0, len(rows), batch_size):
    batch = rows[i:i+batch_size]
    data = json.dumps(batch).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=ins_headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            total += len(batch)
            if (i // batch_size) % 10 == 0:
                print(f"  batch {i//batch_size+1}: {total}/{len(rows)}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"ERROR batch {i//batch_size+1}: {e.code} {body[:500]}")
        import sys; sys.exit(1)

print(f"DONE: {total} items inserted")
