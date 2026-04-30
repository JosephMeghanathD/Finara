#!/usr/bin/env python3
"""
Finara Test Data Seed Script v2
================================
Realistic 3-year financial profile for a software professional.

  • Bi-weekly salary deposits with 2 annual raises & year-end bonuses
  • April tax refunds
  • Full fixed bills: rent (2023 → 2024 increase), car loan, insurance,
    utilities, phone, subscriptions
  • Realistic variable spend: groceries, dining, gas, shopping, healthcare
  • Monthly savings transfer to investment account
  • 24 anomalous transactions across the 3-year period
  • Deletes ALL prior data for this user before inserting

    Login : test@gmail.com / test
    Income: $7,000 → $7,250 → $7,500 (bi-weekly raises Jan 2024 & Jan 2025)

Requirements:
    pip install psycopg2-binary bcrypt
Run while Docker Compose is up:
    python3 seed_test_data.py
"""

import random
import uuid
from datetime import date, timedelta

import bcrypt
import psycopg2

random.seed(42)

# ── Database connection ───────────────────────────────────────────────────────
DB = dict(host="localhost", port=5432, database="finara",
          user="postgres", password="changeme")

START = date(2023, 4, 1)
END   = date(2026, 4, 25)

# ── Merchant tables (description, category, merchant_name, min_$, max_$) ─────

GROCERY_STORES = [
    ("WHOLE FOODS MARKET #112",  "Groceries", "Whole Foods Market",  60, 220),
    ("TRADER JOES #47",          "Groceries", "Trader Joe's",         45, 135),
    ("KROGER SUPERMARKET",       "Groceries", "Kroger",               38, 160),
    ("SAFEWAY STORE #2841",      "Groceries", "Safeway",              42, 150),
    ("COSTCO WHOLESALE #0274",   "Groceries", "Costco Wholesale",    110, 290),
    ("SPROUTS FARMERS MARKET",   "Groceries", "Sprouts",              30, 110),
    ("THE FRESH MARKET #88",     "Groceries", "The Fresh Market",     55, 180),
]

RESTAURANTS = [
    ("CHIPOTLE 1234",              "Food & Drink", "Chipotle",                  11, 22),
    ("STARBUCKS #7382",            "Food & Drink", "Starbucks",                  6, 14),
    ("PANERA BREAD #601312",       "Food & Drink", "Panera Bread",              12, 28),
    ("SHAKE SHACK #0083",          "Food & Drink", "Shake Shack",               14, 30),
    ("SWEETGREEN #27",             "Food & Drink", "Sweetgreen",                13, 24),
    ("CHICK-FIL-A #02348",         "Food & Drink", "Chick-fil-A",                9, 20),
    ("UBEREATS *ORDER",            "Food & Drink", "Uber Eats",                 22, 68),
    ("DOORDASH*DELIVERY",          "Food & Drink", "DoorDash",                  20, 58),
    ("OLIVE GARDEN 1904",          "Food & Drink", "Olive Garden",              32, 82),
    ("CHEESECAKE FACTORY #0394",   "Food & Drink", "The Cheesecake Factory",    45, 110),
    ("TRUE FOOD KITCHEN",          "Food & Drink", "True Food Kitchen",         28, 72),
    ("LOCAL SUSHI BAR",            "Food & Drink", "Sakura Sushi",              35, 85),
    ("NORTH ITALIA #042",          "Food & Drink", "North Italia",              40, 95),
    ("FLOWER CHILD #18",           "Food & Drink", "Flower Child",              18, 42),
    ("MCDONALDS #38742",           "Food & Drink", "McDonald's",                 8, 15),
    ("DUNKIN #350022",             "Food & Drink", "Dunkin'",                    5, 10),
    ("PIZZA HUT #1038",            "Food & Drink", "Pizza Hut",                 20, 45),
    ("CALIFORNIA PIZZA KITCHEN",   "Food & Drink", "California Pizza Kitchen",  28, 65),
    ("FIRST WATCH RESTAURANT",     "Food & Drink", "First Watch",               18, 42),
    ("BARTACO RESTAURANT",         "Food & Drink", "BarTaco",                   28, 68),
]

GAS_STATIONS = [
    ("SHELL OIL 57442000",    "Transportation", "Shell"),
    ("EXXONMOBIL 97441200",   "Transportation", "ExxonMobil"),
    ("BP#8374930",            "Transportation", "BP"),
    ("CHEVRON #9374821",      "Transportation", "Chevron"),
    ("CIRCLE K FUEL #4829",   "Transportation", "Circle K"),
]

RETAIL_SHOPS = [
    ("TARGET 00892",           "Shopping", "Target",              25, 160),
    ("MARSHALLS #0923",        "Shopping", "Marshalls",           22, 110),
    ("TJ MAXX #0482",          "Shopping", "TJ Maxx",             18, 120),
    ("HOME DEPOT #4028",       "Shopping", "Home Depot",          30, 180),
    ("WEST ELM ONLINE",        "Shopping", "West Elm",            45, 320),
    ("ANTHROPOLOGIE #0382",    "Shopping", "Anthropologie",       38, 180),
    ("NORDSTROM RACK #0492",   "Shopping", "Nordstrom Rack",      35, 190),
    ("ULTA BEAUTY #1048",      "Shopping", "Ulta Beauty",         28, 140),
    ("LULULEMON #2048",        "Shopping", "Lululemon",           48, 220),
    ("BEST BUY #0042",         "Shopping", "Best Buy",            25, 250),
]

AMAZON_DESCS = [
    ("AMAZON.COM*PURCHASE",   "Amazon.com"),
    ("AMZN MKTP US*PURCHASE", "Amazon Marketplace"),
    ("AMAZON.COM*HOUSEHOLD",  "Amazon.com"),
    ("AMAZON.COM*DIGITAL",    "Amazon Digital"),
    ("AMZN MKTP US*G4H82",    "Amazon Marketplace"),
]

PHARMA = [
    ("WALGREENS #18342",   "Healthcare", "Walgreens"),
    ("CVS PHARMACY #9023", "Healthcare", "CVS Pharmacy"),
]

ENTERTAINMENT_ITEMS = [
    ("AMC THEATRES #342",      "Entertainment", "AMC Theatres",           14, 45),
    ("STEAM PURCHASE",         "Entertainment", "Steam",                   8, 70),
    ("PLAYSTATION NETWORK",    "Entertainment", "PlayStation Network",     12, 80),
    ("FANDANGO INTERNET",      "Entertainment", "Fandango",               28, 62),
    ("NINTENDO ESHOP",         "Entertainment", "Nintendo eShop",         10, 60),
    ("EVENTBRITE *EVENT",      "Entertainment", "Eventbrite",             35, 150),
    ("BOWLING LUCKY STRIKE",   "Entertainment", "Lucky Strike Lanes",     28, 65),
]

PERSONAL_CARE = [
    ("GREAT CLIPS #8234",       "Personal Care", "Great Clips",           28, 45),
    ("SPORT CLIPS #4820",       "Personal Care", "Sport Clips",           32, 52),
    ("LUXE NAIL SPA",           "Personal Care", "Luxe Nail Spa",         45, 90),
    ("FLOYD'S BARBERSHOP",      "Personal Care", "Floyd's Barbershop",    38, 58),
]

# ── Pre-defined anomalies ─────────────────────────────────────────────────────
# (year, month, day, desc, merchant, amount, category, reason)
ANOMALIES = [
    # Jun 2023 — Transmission failure (Toyota Camry at dealer)
    (2023, 6, 14,
     "TOYOTA OF HENDRICK SERVICE", "Toyota Dealership", 2840.00, "Transportation",
     "Dealer service charge is 9.2× your average Transportation transaction; "
     "transmission repair — single largest Transportation expense on record"),

    # Aug 2023 — Las Vegas trip (5 days, no travel in prior 5 months)
    (2023, 8, 2,
     "SOUTHWEST AIRLINES FLIGHT", "Southwest Airlines", 558.40, "Travel",
     "No Travel spend in prior 5 months; first large Travel charge in dataset"),
    (2023, 8, 3,
     "BELLAGIO HOTEL LAS VEGAS", "Bellagio Hotel & Casino", 1680.00, "Travel",
     "Hotel charge day after airline ticket; combined 2-day Travel spend highest on record"),
    (2023, 8, 5,
     "CAESARS PALACE ENTERTAINMENT", "Caesars Palace", 680.00, "Entertainment",
     "Entertainment spend is 8.4× your typical Entertainment transaction; "
     "charged while Travel cluster is active"),
    (2023, 8, 6,
     "GORDON RAMSAY HELL KITCHEN", "Gordon Ramsay Hell's Kitchen", 318.00, "Food & Drink",
     "Restaurant charge is 7.1× your average Food & Drink transaction; "
     "upscale dining during Las Vegas travel window"),

    # Nov 2023 — Black Friday electronics haul
    (2023, 11, 24,
     "AMAZON.COM*BLACK FRIDAY TV", "Amazon.com", 1847.00, "Shopping",
     "Largest Amazon charge in dataset; 11.2× your average Amazon transaction"),
    (2023, 11, 24,
     "BEST BUY MACBOOK AIR BF", "Best Buy", 1099.99, "Shopping",
     "Second large Shopping charge on Black Friday; "
     "combined daily Shopping of $2,947 is highest single-day spend on record"),

    # Dec 2023 — Holiday gift splurge
    (2023, 12, 21,
     "NORDSTROM HOLIDAY GIFTS", "Nordstrom", 890.00, "Shopping",
     "Nordstrom not seen in prior 12 months; amount exceeds 96th percentile "
     "for Shopping — elevated holiday-season pattern"),

    # Feb 2024 — ER visit (appendicitis scare)
    (2024, 2, 12,
     "REGIONAL MEDICAL CENTER ER", "Regional Medical Center", 3840.00, "Healthcare",
     "Largest single charge in entire dataset; ER visit is 28× your typical "
     "Healthcare transaction — emergency medical pattern detected"),
    (2024, 2, 13,
     "CVS PHARMACY ER PRESCRIPTS", "CVS Pharmacy", 340.00, "Healthcare",
     "Pharmacy spend is 4.2× typical; follows large ER charge — "
     "2-day Healthcare cluster anomaly ($4,180 combined)"),

    # May 2024 — MacBook Pro M3
    (2024, 5, 11,
     "APPLE STORE MACBOOK PRO M3", "Apple Store", 2499.00, "Shopping",
     "Highest single Shopping transaction on record; Apple Store not seen "
     "in prior 13 months — large electronics purchase"),

    # Jul 2024 — Washer + dryer replacement
    (2024, 7, 18,
     "HOME DEPOT WASHER DRYER", "Home Depot", 1599.99, "Shopping",
     "Home Depot charge is 11.4× your average Home Depot transaction; "
     "major appliance purchase — no similar spend in prior 15 months"),

    # Oct 2024 — VIP concert tickets
    (2024, 10, 15,
     "STUBHUB VIP CONCERT TICKETS", "StubHub", 1240.00, "Entertainment",
     "Entertainment charge is 9.3× your median; VIP ticket purchase — "
     "merchant not seen in prior 8 months"),

    # Nov 2024 — Black Friday again (year-over-year pattern, still anomalous)
    (2024, 11, 29,
     "AMAZON.COM*BF ELECTRONICS", "Amazon.com", 2140.00, "Shopping",
     "Second consecutive Black Friday large Amazon charge; "
     "amount is 13× average Amazon transaction, exceeds prior BF spend"),

    # Dec 2024 — Holiday overspend
    (2024, 12, 20,
     "NORDSTROM HOLIDAY PURCHASE", "Nordstrom", 1920.00, "Shopping",
     "Second Nordstrom appearance (first was Dec 2023); amount is highest "
     "December Shopping charge outside of Black Friday window"),

    # Mar 2025 — Dental implant (costly procedure)
    (2025, 3, 6,
     "ADVANCED DENTAL IMPLANTS", "Advanced Dental Implants PC", 2280.00, "Healthcare",
     "Healthcare charge is 16.5× your median; dental implant — "
     "specialist not previously seen, far exceeds any prior dental spend"),
    (2025, 3, 7,
     "WALGREENS POST-DENTAL RX", "Walgreens", 185.00, "Healthcare",
     "Elevated pharmacy spend day after dental implant procedure; "
     "prescription cluster following specialist visit"),

    # Jun 2025 — Paris vacation (no travel in prior 12 months)
    (2025, 6, 10,
     "DELTA INTL PARIS ROUNDTRIP", "Delta Air Lines", 2840.00, "Travel",
     "Largest Travel charge on record; international flight — "
     "no Travel spend in prior 12 months"),
    (2025, 6, 11,
     "HOTEL LUTETIA PARIS 5NT", "Hotel Lutetia", 2460.00, "Travel",
     "Luxury hotel — second large Travel charge within 24 hours; "
     "combined 2-day Travel total ($5,300) is 5× highest prior travel event"),
    (2025, 6, 14,
     "PARIS FINE DINING ALAIN DUC", "Alain Ducasse au Plaza Athénée", 520.00, "Food & Drink",
     "Restaurant spend is 9.8× your average Food & Drink transaction; "
     "fine-dining charge while international Travel cluster is active"),

    # Sep 2025 — Gaming PC build (two-merchant same-day purchase)
    (2025, 9, 12,
     "NEWEGG COMPUTER PARTS", "Newegg", 1380.00, "Shopping",
     "Merchant first seen in dataset; large tech spend with no similar "
     "purchase in 18-month window"),
    (2025, 9, 12,
     "AMAZON.COM*PC COMPONENTS", "Amazon.com", 960.00, "Shopping",
     "Large Amazon charge same day as Newegg; combined $2,340 tech spend "
     "is 2nd highest single-day Shopping total on record"),

    # Jan 2026 — New Year fitness gear binge
    (2026, 1, 5,
     "PELOTON BIKE PURCHASE", "Peloton Interactive", 1445.00, "Shopping",
     "Fitness equipment in January — New Year resolution pattern; "
     "highest single January transaction on record"),
    (2026, 1, 6,
     "DICKS SPORTING GOODS GEAR", "Dick's Sporting Goods", 680.00, "Shopping",
     "Second large fitness purchase within 24 hours; combined January "
     "fitness spend far exceeds any prior January"),

    # Mar 2026 — Emergency plumbing (burst pipe)
    (2026, 3, 18,
     "EMERGENCY PLUMBING & DRAIN", "Emergency Plumbing Services LLC", 2100.00, "Utilities",
     "Utilities charge is 14.2× your average Utilities transaction; "
     "emergency after-hours service — out-of-band payment pattern"),
]


# ── Helpers ───────────────────────────────────────────────────────────────────
def month_end(y, m):
    """Last calendar day of month, capped at END."""
    first_next = (date(y, m, 28) + timedelta(days=4)).replace(day=1)
    return min(first_next - timedelta(days=1), END)


def rnd(lo, hi):
    return round(random.uniform(lo, hi), 2)


def rand_day(y, m, lo=1, hi=None):
    ceiling = month_end(y, m).day
    return date(y, m, random.randint(lo, min(hi or ceiling, ceiling)))


def paycheck_amount(pay_date):
    """Bi-weekly take-home.  Two raises over 3 years."""
    if pay_date < date(2024, 1, 1):
        base = 3_231   # ~$7,000 / month
    elif pay_date < date(2025, 1, 1):
        base = 3_346   # ~$7,250 / month  (Jan 2024 raise)
    else:
        base = 3_461   # ~$7,500 / month  (Jan 2025 raise)
    return round(base + random.uniform(-28, 28), 2)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    conn = psycopg2.connect(**DB)
    cur  = conn.cursor()

    # ── 1. Upsert user ─────────────────────────────────────────────────────
    pw_hash = bcrypt.hashpw(b"test", bcrypt.gensalt(rounds=10)).decode()
    cur.execute("""
        INSERT INTO users
            (email, password_hash, first_name, last_name, monthly_income, created_at)
        VALUES (%s, %s, 'Test', 'User', 7500.00, NOW())
        ON CONFLICT (email) DO UPDATE
            SET password_hash  = EXCLUDED.password_hash,
                monthly_income = EXCLUDED.monthly_income
        RETURNING id
    """, ("test@gmail.com", pw_hash))
    user_id = cur.fetchone()[0]
    print(f"User id={user_id}  (test@gmail.com / test)")

    # ── 2. Wipe all existing data for this user ─────────────────────────────
    cur.execute("DELETE FROM transactions      WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM financial_reports WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM budgets           WHERE user_id = %s", (user_id,))
    print("Cleared prior data.")

    # ── 3. Anomaly lookup  (year,month,day) → [(desc,merch,amt,cat,reason)] ─
    anom_lookup: dict = {}
    for ay, am, ad, desc, merch, amt, cat, reason in ANOMALIES:
        anom_lookup.setdefault((ay, am, ad), []).append((desc, merch, amt, cat, reason))

    rows = []   # (date, desc, merch, amount, cat, tx_type, is_anom, score, reason, batch)

    def debit(d, desc, merch, amount, cat,
              is_anom=False, score=None, reason=None, batch=None):
        rows.append((d, desc, merch, amount, cat,
                     "DEBIT", is_anom, score, reason, batch or _batch))

    def credit(d, desc, merch, amount, cat, batch=None):
        rows.append((d, desc, merch, amount, cat,
                     "CREDIT", False, None, None, batch or _batch))

    # ── 4A. Generate income (CREDIT) transactions ──────────────────────────
    #   Bi-weekly on Fridays starting from first Friday ≥ START
    days_to_friday = (4 - START.weekday()) % 7   # Friday = weekday 4
    pay_date = START + timedelta(days=days_to_friday)
    pay_batch = uuid.uuid4().hex[:8]

    while pay_date <= END:
        amt = paycheck_amount(pay_date)
        credit(pay_date, "DIR DEP NEXUS SOFTWARE INC", "Nexus Software Inc",
               amt, "Income", batch=pay_batch)
        pay_date += timedelta(days=14)
        if random.random() < 0.05:          # rotate batch ~5% of the time
            pay_batch = uuid.uuid4().hex[:8]

    # Year-end bonuses (CREDIT)
    for yr, bonus in [(2023, 4_000.00), (2024, 5_000.00), (2025, 5_500.00)]:
        bonus_date = date(yr, 12, 20)
        if bonus_date <= END:
            credit(bonus_date, "NEXUS SOFTWARE ANNUAL BONUS", "Nexus Software Inc",
                   bonus, "Income", batch=uuid.uuid4().hex[:8])

    # Annual tax refunds (CREDIT, arrives March-April)
    for refund_date, amt in [
        (date(2023, 4, 18), 1_450.00),
        (date(2024, 3, 22), 1_820.00),
        (date(2025, 4, 11), 1_630.00),
        (date(2026, 3, 28), 1_950.00),
    ]:
        if refund_date <= END:
            credit(refund_date, "IRS TAX REFUND", "U.S. Treasury",
                   amt, "Income", batch=uuid.uuid4().hex[:8])

    # ── 4B. Generate expense (DEBIT) transactions month by month ───────────
    cur_month = START.replace(day=1)
    while cur_month <= END:
        y, m = cur_month.year, cur_month.month
        me = month_end(y, m)
        _batch = uuid.uuid4().hex[:8]

        is_holiday = m in {11, 12}
        is_summer  = m in {6, 7, 8}
        is_winter  = m in {12, 1, 2}

        # ── RENT ──────────────────────────────────────────────────────────
        # Lease renewal Jul 2024: $2,200 → $2,350
        rent = 2_350.00 if (y, m) >= (2024, 7) else 2_200.00
        debit(date(y, m, 1), "RENT PAYMENT APT 12C", "Harborview Properties", rent, "Housing")

        # ── CAR LOAN ──────────────────────────────────────────────────────
        # Toyota Camry XSE 2022, financed at dealer
        debit(date(y, m, 5), "TOYOTA FINANCIAL SERVICES", "Toyota Financial Services",
              rnd(408, 418), "Transportation")

        # ── CAR INSURANCE ─────────────────────────────────────────────────
        ins = 165.00 if (y, m) >= (2025, 1) else 155.00   # premium went up Jan 2025
        debit(date(y, m, 3), "STATE FARM AUTO INSURANCE", "State Farm", ins, "Transportation")

        # ── RENTER'S INSURANCE ────────────────────────────────────────────
        debit(date(y, m, 3), "LEMONADE RENTERS INS", "Lemonade Insurance", 14.50, "Utilities")

        # ── SUBSCRIPTIONS ─────────────────────────────────────────────────
        # Netflix price increase Nov 2023 ($15.99 → $22.99)
        netflix = 22.99 if (y, m) >= (2023, 11) else 15.99
        debit(date(y, m, 4), "NETFLIX.COM", "Netflix", netflix, "Entertainment")

        # Spotify price increase Jul 2023 ($9.99 → $11.99)
        spotify = 11.99 if (y, m) >= (2023, 7) else 9.99
        debit(date(y, m, 6), "SPOTIFY USA", "Spotify", spotify, "Entertainment")

        debit(date(y, m,  8), "AMAZON PRIME MEMBERSHIP", "Amazon",        14.99, "Shopping")
        # iCloud upgraded to 2TB plan Jan 2024
        icloud = 9.99 if (y, m) >= (2024, 1) else 2.99
        debit(date(y, m, 11), "APPLE.COM/BILL", "Apple", icloud, "Entertainment")

        if (y, m) >= (2023, 10):
            debit(date(y, m, 13), "DISNEY PLUS SUBSCRIPTION", "Disney+",  13.99, "Entertainment")
        if (y, m) >= (2024, 2):
            debit(date(y, m, 16), "EQUINOX FITNESS CLUB",  "Equinox Fitness", 85.00, "Healthcare")
        if (y, m) >= (2025, 3):
            debit(date(y, m, 19), "HBO MAX SUBSCRIPTION", "HBO Max",       15.99, "Entertainment")
        # YouTube Premium added Sep 2023
        if (y, m) >= (2023, 9):
            debit(date(y, m, 22), "YOUTUBE PREMIUM", "Google",             13.99, "Entertainment")

        # ── UTILITIES ─────────────────────────────────────────────────────
        electric = (rnd(165, 235) if is_summer
                    else rnd(140, 210) if is_winter
                    else rnd(95, 148))
        debit(rand_day(y, m, 2, 9),  "DUKE ENERGY ELECTRIC",  "Duke Energy",
              electric, "Utilities")

        gas_bill = rnd(95, 165) if is_winter else rnd(28, 68)
        debit(rand_day(y, m, 3, 10), "PIEDMONT NATURAL GAS",  "Piedmont Natural Gas",
              gas_bill, "Utilities")

        # Internet — Comcast raised price Jan 2025
        internet = 84.99 if (y, m) >= (2025, 1) else 74.99
        debit(rand_day(y, m, 6, 13), "COMCAST XFINITY INTERNET", "Comcast",
              internet, "Utilities")

        debit(rand_day(y, m, 7, 16), "VERIZON WIRELESS", "Verizon", 92.50, "Utilities")

        if m % 2 == 1:  # water billed every other month
            debit(rand_day(y, m, 9, 18), "CITY WATER & SEWER", "City Water Services",
                  rnd(52, 88), "Utilities")

        # ── GROCERIES  (4–9 trips, more at Costco in non-summer) ──────────
        n_grocery = random.randint(5, 9)
        g_days = sorted(random.sample(range(1, me.day + 1), min(n_grocery, me.day)))
        for gd in g_days:
            desc, cat, merch, lo, hi = random.choice(GROCERY_STORES)
            debit(date(y, m, gd), desc, merch, rnd(lo, hi), cat)

        # ── DINING OUT ────────────────────────────────────────────────────
        n_dining = (random.randint(18, 26) if (is_summer or m == 2)
                    else random.randint(14, 20) if is_holiday
                    else random.randint(10, 17))
        for _ in range(n_dining):
            desc, cat, merch, lo, hi = random.choice(RESTAURANTS)
            debit(rand_day(y, m), desc, merch, rnd(lo, hi), cat)

        # ── GAS  (3–5 fill-ups; Toyota Camry, 35 mpg) ────────────────────
        for _ in range(random.randint(3, 5)):
            desc, cat, merch = random.choice(GAS_STATIONS)
            debit(rand_day(y, m), desc, merch, rnd(55, 98), cat)

        # ── AMAZON ────────────────────────────────────────────────────────
        n_amzn = random.randint(6, 14) if is_holiday else random.randint(3, 7)
        for _ in range(n_amzn):
            desc, merch = random.choice(AMAZON_DESCS)
            debit(rand_day(y, m), desc, merch, rnd(18, 140), "Shopping")

        # ── RETAIL SHOPPING ───────────────────────────────────────────────
        for _ in range(random.randint(2, 5)):
            desc, cat, merch, lo, hi = random.choice(RETAIL_SHOPS)
            debit(rand_day(y, m), desc, merch, rnd(lo, hi), cat)

        # ── PHARMACY ──────────────────────────────────────────────────────
        if random.random() < 0.45:
            desc, cat, merch = random.choice(PHARMA)
            debit(rand_day(y, m), desc, merch, rnd(15, 75), cat)

        # ── ENTERTAINMENT ─────────────────────────────────────────────────
        if random.random() < 0.60:
            desc, cat, merch, lo, hi = random.choice(ENTERTAINMENT_ITEMS)
            debit(rand_day(y, m), desc, merch, rnd(lo, hi), cat)

        # ── PERSONAL CARE  (haircut / grooming, most months) ──────────────
        if random.random() < 0.85:
            desc, cat, merch, lo, hi = random.choice(PERSONAL_CARE)
            debit(rand_day(y, m, 5, 25), desc, merch, rnd(lo, hi), cat)

        # ── MONTHLY SAVINGS TRANSFER ──────────────────────────────────────
        # Grows with income raises
        if y <= 2023:
            save_amt = rnd(600, 900)
        elif y == 2024:
            save_amt = rnd(700, 1_050)
        else:
            save_amt = rnd(800, 1_200)
        debit(rand_day(y, m, 25, 28),
              "TRANSFER TO VANGUARD BROKERAGE", "Vanguard",
              save_amt, "Transfer")

        # ── QUARTERLY OIL CHANGE / CAR SERVICE ───────────────────────────
        if m in {1, 4, 7, 10}:
            debit(rand_day(y, m, 5, 20),
                  "JIFFY LUBE SERVICE #0482", "Jiffy Lube",
                  rnd(78, 135), "Transportation")

        # ── SEMI-ANNUAL DENTAL CLEANING ───────────────────────────────────
        if m in {4, 10}:
            debit(rand_day(y, m, 8, 22),
                  "BRIGHT SMILE DENTAL OFFICE", "Bright Smile Dental",
                  rnd(195, 265), "Healthcare")

        # ── SEASONAL ONE-OFFS ─────────────────────────────────────────────

        # Valentine's Day (February 14)
        if m == 2 and me.day >= 14:
            debit(date(y, m, 14),
                  "TELEFLORA FLOWERS DELIVERY", "Teleflora",
                  rnd(80, 160), "Shopping")
            debit(date(y, m, 14),
                  "VALENTINES DINNER RESY",     "OpenTable Restaurant",
                  rnd(110, 200), "Food & Drink")

        # Tax software (April — normal amount; 2026 version is in anomalies)
        tax = {2023: ("TURBOTAX DELUXE 2022", "TurboTax",  64.99, 12),
               2024: ("TURBOTAX PREMIER 2023", "TurboTax",  84.99,  9),
               2025: ("TURBOTAX PREMIER 2024", "TurboTax",  84.99, 11)}
        if m == 4 and y in tax:
            d_desc, d_merch, d_amt, d_day = tax[y]
            debit(date(y, m, d_day), d_desc, d_merch, d_amt, "Shopping")

        # Back-to-school (August)
        if m == 8:
            debit(rand_day(y, m, 12, 26), "STAPLES STORE #1234", "Staples",
                  rnd(55, 145), "Shopping")

        # Holiday cards + wrapping (December)
        if m == 12:
            debit(rand_day(y, m, 8, 18), "HALLMARK GOLD CROWN",
                  "Hallmark", rnd(22, 58), "Shopping")
            if me.day >= 24:
                debit(date(y, m, 24), "CHRISTMAS EVE DINNER", "STK Steakhouse",
                      rnd(140, 240), "Food & Drink")
            if me.day == 31:
                debit(date(y, m, 31), "NEW YEARS EVE PARTY", "NYE Venue",
                      rnd(80, 160), "Entertainment")

        # Spring deep-clean / home supplies (March)
        if m == 3:
            debit(rand_day(y, m, 7, 20), "TARGET HOME DEPT", "Target",
                  rnd(65, 175), "Shopping")

        # Summer outdoor activities (June / July)
        if m in {6, 7}:
            debit(rand_day(y, m, 5, 25), "REI CO-OP #0482", "REI",
                  rnd(45, 185), "Shopping")
            debit(rand_day(y, m, 8, 28), "NATIONAL PARK RECREATION",
                  "Recreation.gov", rnd(28, 75), "Entertainment")

        # ── Advance to next month ──────────────────────────────────────────
        cur_month = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)

    # ── 4C. Inject pre-defined anomalies ──────────────────────────────────
    for (ay, am, ad), entries in anom_lookup.items():
        a_batch = uuid.uuid4().hex[:8]
        for desc, merch, amt, cat, reason in entries:
            score = round(random.uniform(0.79, 0.97), 4)
            debit(date(ay, am, ad), desc, merch, amt, cat,
                  is_anom=True, score=score, reason=reason, batch=a_batch)

    # ── 5. Batch insert ─────────────────────────────────────────────────────
    print(f"Inserting {len(rows)} transactions …")

    for (tx_date, desc, merch, amount, cat,
         tx_type, is_anom, score, reason, batch) in rows:

        conf = None if tx_type == "CREDIT" else round(random.uniform(0.85, 0.99), 3)

        cur.execute("""
            INSERT INTO transactions (
                user_id, description, merchant_name, amount, transaction_date,
                category, category_confidence, transaction_type,
                is_anomaly, anomaly_score, anomaly_reason,
                upload_batch_id, raw_csv_row, created_at
            ) VALUES (%s,%s,%s,%s,%s, %s,%s,%s, %s,%s,%s, %s,%s, NOW())
        """, (
            user_id, desc, merch, amount, tx_date,
            cat, conf, tx_type,
            is_anom, score if is_anom else None, reason,
            batch, f"{tx_date},{desc},{amount}",
        ))

    conn.commit()
    cur.close()
    conn.close()

    # ── 6. Summary ─────────────────────────────────────────────────────────
    n_credit = sum(1 for r in rows if r[5] == "CREDIT")
    n_debit  = sum(1 for r in rows if r[5] == "DEBIT")
    n_anom   = sum(1 for r in rows if r[6])
    months   = len({(r[0].year, r[0].month) for r in rows})

    print("=" * 55)
    print("Seed complete!")
    print(f"  Login        : test@gmail.com / test")
    print(f"  User ID      : {user_id}")
    print(f"  Period       : {START} → {END}  ({months} months)")
    print(f"  Total rows   : {len(rows)}")
    print(f"    Income (CREDIT) : {n_credit}  (bi-weekly pay + bonuses + refunds)")
    print(f"    Expense (DEBIT) : {n_debit}")
    print(f"    Anomalies       : {n_anom}")
    print(f"  App URL      : http://localhost:3000")


if __name__ == "__main__":
    main()
