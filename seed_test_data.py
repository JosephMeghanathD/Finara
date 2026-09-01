#!/usr/bin/env python3
"""
Finara Test Data Seed Script v4
================================
Realistic multi-year financial profile for a software professional.
Default window is 2023-04-01 → today; override with SEED_START / SEED_END
(YYYY-MM-DD). Era data is defined from 2020-01 through 2027-12, so the window
can be widened either way without touching the schedules. The final month is
normally partial — every generator clips to END and scales its transaction
counts by the fraction of the month that has actually elapsed.

  • Vacations as multi-day clusters — flight booked weeks ahead, then lodging,
    local transport, destination dining, attractions and souvenirs. Home-city
    groceries/gas/dining/retail go quiet for the days spent away.
  • Health events as episodes rather than one-off spikes — ER or specialist
    visit followed by imaging, weekly physical therapy and pharmacy copays
  • Per-category monthly budgets derived from trailing actual spend
  • Bi-weekly salary deposits with annual raises, year-end bonuses, tax refunds
  • Era-aware realism:
      2020  COVID — temporary pay cut, stimulus checks, gym closure, dining
            collapse + delivery surge, near-zero commuting, panic grocery runs
      2021  Recovery — stimulus, gradual return to restaurants/travel
      2022  Inflation + gas price spike, car replaced (Civic → Camry)
      2023+ Steady growth (unchanged from the previous 3-year profile)
      2026-27 Continued raises, rent/subscription/utility escalation
  • Full fixed bills: rent (7 lease renewals), car loan, insurance, utilities,
    phone, and a subscription stack that grows/reprices on real-world dates
  • Variable spend scaled by a per-year inflation factor (2023 = 1.00 baseline)
  • Anomalous transactions spread across the period (those inside the window)
  • Deletes ALL prior data for this user before inserting

Coach tips and financial reports are deliberately NOT seeded — the app writes
those itself through Gemma. Run ./warm_app_data.sh afterwards to generate them
against the fresh transactions.

    Login : test@gmail.com / test
    Income: $2,640 → $3,920 bi-weekly take-home (2020 → 2027)

Requirements:
    pip install psycopg2-binary bcrypt
Run while Docker Compose is up:
    python3 seed_test_data.py
Seed the cloud DB instead:
    DATABASE_URL='postgresql://...' python3 seed_test_data.py
Restart the backend afterwards — @Cacheable months/summaries stay stale.
"""

import os
import random
import uuid
from datetime import date, timedelta

import bcrypt
import psycopg2
from psycopg2.extras import execute_values

random.seed(42)

# ── Database connection ───────────────────────────────────────────────────────
DB = dict(host="localhost", port=5432, database="finara",
          user="postgres", password="changeme")

# Seeded window. Override with SEED_START / SEED_END (YYYY-MM-DD) — the monthly
# loop and every dated event (bonuses, refunds, anomalies) are clipped to END,
# so shortening the window never emits stray future-dated rows.
def _date_env(var, default):
    raw = os.getenv(var)
    return date.fromisoformat(raw) if raw else default

START = _date_env("SEED_START", date(2023, 4, 1))
END   = _date_env("SEED_END",   date.today())

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

# Lockdown-era subset: delivery + drive-thru only (dine-in was closed)
COVID_RESTAURANTS = [r for r in RESTAURANTS if r[2] in {
    "Uber Eats", "DoorDash", "Chipotle", "McDonald's", "Chick-fil-A",
    "Pizza Hut", "Dunkin'", "Panera Bread",
}]

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

# At-home entertainment — the only kind available during lockdown
COVID_ENTERTAINMENT = [e for e in ENTERTAINMENT_ITEMS if e[2] in {
    "Steam", "PlayStation Network", "Nintendo eShop",
}]

PERSONAL_CARE = [
    ("GREAT CLIPS #8234",       "Personal Care", "Great Clips",           28, 45),
    ("SPORT CLIPS #4820",       "Personal Care", "Sport Clips",           32, 52),
    ("LUXE NAIL SPA",           "Personal Care", "Luxe Nail Spa",         45, 90),
    ("FLOYD'S BARBERSHOP",      "Personal Care", "Floyd's Barbershop",    38, 58),
]

# ── Vacations ─────────────────────────────────────────────────────────────────
# A trip is a cluster, not a pair of big charges. Each entry lists the hand-
# written anchor charges (`fixed`, by day offset from arrival — a negative
# offset is a booking made before departure) plus destination merchant pools
# that fill in the day-to-day spend. Trip days land in AWAY_DAYS, which makes
# the home-city generators go quiet for the duration.
#
#   fixed  : (day_offset, description, merchant, amount, category, anomaly_reason|None)
#   pools  : (description, merchant, category, min_$, max_$)
#   counts : how many filler charges to draw from (transport, dining, outings, shopping)

VACATIONS = [
    dict(
        label="Las Vegas long weekend", start=date(2023, 8, 2), days=5,
        fixed=[
            (-38, "SOUTHWEST AIRLINES FLIGHT", "Southwest Airlines", 558.40, "Travel",
             "First Travel charge in the dataset; no prior airline spend on record"),
            (1, "BELLAGIO HOTEL LAS VEGAS", "Bellagio Hotel & Casino", 1680.00, "Travel",
             "Largest Travel charge to date; 3.0× the airfare booked for the same trip"),
            (3, "CAESARS PALACE ENTERTAINMENT", "Caesars Palace", 680.00, "Entertainment",
             "Entertainment charge is 14.2× your average; falls inside an active Travel cluster"),
            (4, "GORDON RAMSAY HELL KITCHEN", "Gordon Ramsay Hell's Kitchen", 318.00, "Food & Drink",
             "Restaurant spend is 8.7× your average Food & Drink transaction"),
        ],
        transport=[("LYFT *RIDE LAS VEGAS", "Lyft", "Transportation", 16, 48),
                   ("UBER *TRIP LAS VEGAS", "Uber", "Transportation", 14, 44),
                   ("HARRY REID AIRPORT PARKING", "Harry Reid Airport", "Travel", 26, 62)],
        dining=[("IN-N-OUT BURGER #382", "In-N-Out Burger", "Food & Drink", 12, 28),
                ("MON AMI GABI LAS VEGAS", "Mon Ami Gabi", "Food & Drink", 68, 145),
                ("BACCHANAL BUFFET", "Bacchanal Buffet", "Food & Drink", 75, 130),
                ("STARBUCKS BELLAGIO", "Starbucks", "Food & Drink", 8, 18)],
        outings=[("HIGH ROLLER OBSERVATION WHL", "The LINQ", "Entertainment", 38, 78),
                 ("CIRQUE DU SOLEIL O TICKETS", "Cirque du Soleil", "Entertainment", 120, 245)],
        shopping=[("LAS VEGAS GIFT SHOP", "LV Souvenirs", "Shopping", 22, 68)],
        counts=(3, 6, 2, 1),
    ),
    dict(
        label="Breckenridge ski trip", start=date(2024, 3, 7), days=5,
        fixed=[
            (-44, "UNITED AIRLINES CLT-DEN", "United Airlines", 486.00, "Travel", None),
            (0, "BEAVER RUN RESORT 4NT", "Beaver Run Resort", 1240.00, "Travel",
             "Largest Travel charge since the Aug 2023 Las Vegas trip; lodging booked for 4 nights"),
            (1, "EPIC PASS LIFT TICKETS", "Vail Resorts", 642.00, "Entertainment",
             "Entertainment charge is 12.8× your average; no comparable spend in the prior 6 months"),
        ],
        transport=[("HERTZ RENT-A-CAR DENVER", "Hertz", "Travel", 180, 320),
                   ("SHELL BRECKENRIDGE CO", "Shell", "Transportation", 48, 78)],
        dining=[("BRECKENRIDGE BREWERY", "Breckenridge Brewery", "Food & Drink", 42, 88),
                ("HEARTHSTONE RESTAURANT", "Hearthstone Restaurant", "Food & Drink", 78, 165),
                ("CREPES A LA CART", "Crepes a la Cart", "Food & Drink", 14, 32),
                ("COLUMBINE CAFE BRECK", "Columbine Cafe", "Food & Drink", 22, 48)],
        outings=[("SKI RENTAL BRECKENRIDGE", "Christy Sports", "Entertainment", 95, 180)],
        shopping=[("PATAGONIA BRECKENRIDGE", "Patagonia", "Shopping", 85, 240)],
        counts=(2, 6, 1, 1),
    ),
    dict(
        label="Paris — eight days", start=date(2025, 6, 10), days=8,
        fixed=[
            (-52, "DELTA INTL PARIS ROUNDTRIP", "Delta Air Lines", 2840.00, "Travel",
             "Largest Travel charge on record; international flight — no prior transatlantic "
             "booking in the dataset"),
            (1, "HOTEL LUTETIA PARIS 5NT", "Hotel Lutetia", 2460.00, "Travel",
             "Luxury hotel — second large Travel charge within 24 hours; combined trip spend "
             "is the highest on record"),
            (4, "PARIS FINE DINING ALAIN DUC", "Alain Ducasse au Plaza Athénée", 520.00, "Food & Drink",
             "Restaurant spend is 9.6× your average Food & Drink transaction; fine dining "
             "inside an active international Travel cluster"),
        ],
        transport=[("UBER *TRIP PARIS FR", "Uber", "Transportation", 18, 46),
                   ("RATP METRO CARNET", "RATP", "Transportation", 12, 34),
                   ("SNCF VOYAGES VERSAILLES", "SNCF", "Travel", 24, 58),
                   ("TAXI G7 PARIS CDG", "Taxi G7", "Transportation", 55, 92)],
        dining=[("LE COMPTOIR DU RELAIS", "Le Comptoir du Relais", "Food & Drink", 62, 128),
                ("BOULANGERIE POILANE", "Poilâne", "Food & Drink", 9, 24),
                ("CAFE DE FLORE PARIS", "Café de Flore", "Food & Drink", 28, 65),
                ("BRASSERIE LIPP ST GERMAIN", "Brasserie Lipp", "Food & Drink", 74, 155),
                ("L'AS DU FALLAFEL MARAIS", "L'As du Fallafel", "Food & Drink", 14, 30)],
        outings=[("MUSEE DU LOUVRE", "Musée du Louvre", "Entertainment", 22, 48),
                 ("MUSEE D'ORSAY BILLETS", "Musée d'Orsay", "Entertainment", 18, 40),
                 ("SEINE RIVER CRUISE", "Bateaux Parisiens", "Entertainment", 35, 78)],
        shopping=[("GALERIES LAFAYETTE PARIS", "Galeries Lafayette", "Shopping", 120, 420),
                  ("LE BON MARCHE RIVE GAUCHE", "Le Bon Marché", "Shopping", 85, 260)],
        counts=(5, 9, 3, 2),
    ),
    dict(
        label="Thanksgiving with family — road trip", start=date(2025, 11, 25), days=5,
        fixed=[
            (0, "EXXONMOBIL I-85 ROAD TRIP", "ExxonMobil", 82.40, "Transportation", None),
            (1, "NC TURNPIKE TOLL", "NC Quick Pass", 18.75, "Transportation", None),
            (2, "HARRIS TEETER THANKSGIVING", "Harris Teeter", 186.20, "Groceries", None),
        ],
        transport=[("SHELL OIL RICHMOND VA", "Shell", "Transportation", 52, 84)],
        dining=[("CRACKER BARREL #482", "Cracker Barrel", "Food & Drink", 28, 62),
                ("BOJANGLES #1042", "Bojangles", "Food & Drink", 11, 26),
                ("STARBUCKS I-95 REST STOP", "Starbucks", "Food & Drink", 7, 16)],
        outings=[("AMC THEATRES FAMILY OUTING", "AMC Theatres", "Entertainment", 42, 86)],
        shopping=[("TARGET HOLIDAY GIFTS", "Target", "Shopping", 65, 180)],
        counts=(1, 4, 1, 1),
    ),
    dict(
        label="Maui — summer week", start=date(2026, 7, 8), days=7,
        fixed=[
            (-45, "UNITED AIRLINES SEA-KOA", "United Airlines", 1340.00, "Travel",
             "Largest Travel charge of 2026; long-haul booking well above your typical airfare"),
            (1, "FOUR SEASONS RESORT MAUI", "Four Seasons Resort", 2580.00, "Travel",
             "Resort lodging is the single largest Travel charge on record for a domestic trip; "
             "1.9× the airfare booked for the same week"),
        ],
        transport=[("ALAMO RENT A CAR OGG", "Alamo", "Travel", 320, 520),
                   ("CHEVRON KIHEI HI", "Chevron", "Transportation", 58, 92)],
        dining=[("MAMA'S FISH HOUSE", "Mama's Fish House", "Food & Drink", 165, 320),
                ("MONKEYPOD KITCHEN WAILEA", "Monkeypod Kitchen", "Food & Drink", 58, 125),
                ("LEODA'S KITCHEN & PIE SHOP", "Leoda's", "Food & Drink", 24, 52),
                ("KIHEI CAFFE MAUI", "Kihei Caffe", "Food & Drink", 18, 42),
                ("FOODLAND FARMS KIHEI", "Foodland", "Groceries", 48, 118)],
        outings=[("TRILOGY SNORKEL EXCURSION", "Trilogy Excursions", "Entertainment", 145, 290),
                 ("HALEAKALA NATIONAL PARK", "Recreation.gov", "Entertainment", 30, 62),
                 ("OLD LAHAINA LUAU", "Old Lahaina Luau", "Entertainment", 180, 340)],
        shopping=[("MAUI DIVERS JEWELRY", "Maui Divers", "Shopping", 95, 320),
                  ("WHALERS VILLAGE GIFTS", "Whalers Village", "Shopping", 35, 110)],
        counts=(3, 8, 3, 2),
    ),
]

# ── Health episodes ───────────────────────────────────────────────────────────
# A real medical event leaves a trail: the initial visit, then imaging, follow-
# ups, a course of therapy and pharmacy copays over the following weeks. Only
# the initial spike is anomalous — the follow-up care is what makes it read as
# genuine rather than a random large charge.
#
#   visits    : (day_offset, description, merchant, amount, category, anomaly_reason|None)
#   recurring : (first_offset, every_n_days, count, description, merchant, min_$, max_$)

HEALTH_EPISODES = [
    dict(
        label="Knee injury — ER, MRI, physical therapy", onset=date(2024, 2, 12),
        visits=[
            (0, "REGIONAL MEDICAL CENTER ER", "Regional Medical Center", 3840.00, "Healthcare",
             "Largest single charge in entire dataset; ER visit is 28× your average "
             "Healthcare transaction"),
            (1, "CVS PHARMACY ER PRESCRIPTS", "CVS Pharmacy", 340.00, "Healthcare",
             "Pharmacy charge is 6.8× your average; same-week follow-up to an ER visit"),
            (8, "PIEDMONT ORTHOPAEDIC CONSULT", "Piedmont Orthopaedics", 285.00, "Healthcare", None),
            (15, "ADVANCED IMAGING MRI KNEE", "Advanced Imaging Center", 1150.00, "Healthcare",
             "Imaging charge is 8.4× your average Healthcare transaction; part of an "
             "ongoing care episode that began with an ER visit"),
            (23, "PIEDMONT ORTHO FOLLOW-UP", "Piedmont Orthopaedics", 165.00, "Healthcare", None),
            (26, "WALGREENS #18342 RX REFILL", "Walgreens", 48.30, "Healthcare", None),
            (72, "PIEDMONT ORTHO DISCHARGE", "Piedmont Orthopaedics", 145.00, "Healthcare", None),
        ],
        recurring=[(29, 7, 8, "CAROLINA PHYSICAL THERAPY", "Carolina Physical Therapy", 55, 78)],
    ),
    dict(
        label="Dental implant", onset=date(2025, 3, 6),
        visits=[
            (-21, "BRIGHT SMILE DENTAL CONSULT", "Bright Smile Dental", 210.00, "Healthcare", None),
            (0, "ADVANCED DENTAL IMPLANTS", "Advanced Dental Implants PC", 2280.00, "Healthcare",
             "Healthcare charge is 16.5× your median; dental implant — specialist not "
             "previously seen in the dataset"),
            (1, "WALGREENS POST-DENTAL RX", "Walgreens", 185.00, "Healthcare",
             "Pharmacy charge is 3.7× your average; immediately follows an oral surgery"),
            (12, "ADVANCED DENTAL IMPLANTS F/U", "Advanced Dental Implants PC", 175.00, "Healthcare", None),
            (48, "ADVANCED DENTAL IMPLANTS CRWN", "Advanced Dental Implants PC", 890.00, "Healthcare", None),
        ],
        recurring=[],
    ),
    dict(
        label="Annual physical and vision", onset=date(2025, 9, 16),
        visits=[
            (0, "CAROLINA FAMILY MEDICINE", "Carolina Family Medicine", 195.00, "Healthcare", None),
            (2, "QUEST DIAGNOSTICS LABWORK", "Quest Diagnostics", 148.60, "Healthcare", None),
            (19, "PEARLE VISION EYE EXAM", "Pearle Vision", 128.00, "Healthcare", None),
            (19, "PEARLE VISION LENSES", "Pearle Vision", 342.00, "Healthcare", None),
        ],
        recurring=[],
    ),
    dict(
        label="Influenza — urgent care", onset=date(2026, 1, 21),
        visits=[
            (0, "FASTMED URGENT CARE #12", "FastMed Urgent Care", 175.00, "Healthcare", None),
            (0, "CVS PHARMACY #9023 TAMIFLU", "CVS Pharmacy", 68.40, "Healthcare", None),
            (4, "WALGREENS #18342 COUGH RX", "Walgreens", 32.15, "Healthcare", None),
        ],
        recurring=[],
    ),
    dict(
        label="Annual physical and vision", onset=date(2026, 5, 19),
        visits=[
            (0, "CAROLINA FAMILY MEDICINE", "Carolina Family Medicine", 205.00, "Healthcare", None),
            (2, "QUEST DIAGNOSTICS LABWORK", "Quest Diagnostics", 156.40, "Healthcare", None),
            (24, "PEARLE VISION EYE EXAM", "Pearle Vision", 135.00, "Healthcare", None),
        ],
        recurring=[],
    ),
]

# Days spent away from home, filled in by build_trip_rows(). The home-city
# generators skip these so the ordinary baseline thins out during a trip.
AWAY_DAYS: set = set()

# ── Era schedules ─────────────────────────────────────────────────────────────
# Each is a list of ((year, month), value) sorted ascending; `sched()` returns
# the value in force for a given month.  None means "not billed yet".

PAY_BASE = [                       # bi-weekly take-home
    ((2020, 1), 2_640), ((2021, 1), 2_755), ((2022, 1), 2_930),
    ((2023, 1), 3_231), ((2024, 1), 3_346), ((2025, 1), 3_461),
    ((2026, 1), 3_720), ((2027, 1), 3_920),
]

RENT = [                           # lease renews every July after 2021
    ((2020, 1), 1_650.00), ((2021, 7), 1_720.00), ((2022, 7), 1_950.00),
    ((2023, 1), 2_200.00), ((2024, 7), 2_350.00), ((2025, 7), 2_480.00),
    ((2026, 7), 2_600.00), ((2027, 7), 2_720.00),
]

CAR_INSURANCE = [
    ((2020, 1), 112.00), ((2021, 1), 118.00), ((2022, 1), 128.00),
    ((2023, 1), 155.00), ((2025, 1), 165.00), ((2026, 7), 178.00),
    ((2027, 7), 188.00),
]

RENTERS_INSURANCE = [
    ((2020, 1), 11.00), ((2023, 1), 14.50), ((2026, 1), 17.00),
]

NETFLIX = [                        # real-world price-hike dates
    ((2020, 1), 12.99), ((2020, 11), 13.99), ((2022, 1), 15.49),
    ((2023, 1), 15.99), ((2023, 11), 22.99), ((2026, 1), 24.99),
    ((2027, 1), 26.99),
]

SPOTIFY  = [((2020, 1),  9.99), ((2023, 7), 11.99), ((2026, 1), 12.99)]
PRIME    = [((2020, 1), 12.99), ((2022, 3), 14.99), ((2026, 1), 16.99)]
ICLOUD   = [((2020, 1),  0.99), ((2021, 6),  2.99), ((2024, 1),  9.99)]
DISNEY   = [((2020, 11), 6.99), ((2021, 3),  7.99), ((2023, 10), 13.99),
            ((2026, 1), 15.99)]
HBOMAX   = [((2025, 3), 15.99), ((2027, 1), 17.99)]
YOUTUBE  = [((2023, 9), 13.99), ((2026, 1), 15.99)]

INTERNET = [((2020, 1), 59.99), ((2022, 1), 69.99), ((2023, 1), 74.99),
            ((2025, 1), 84.99), ((2027, 1), 94.99)]
PHONE    = [((2020, 1), 78.50), ((2022, 1), 85.00), ((2023, 1), 92.50),
            ((2026, 1), 99.00), ((2027, 7), 105.00)]

GYM_OLD  = [((2020, 1), 34.99), ((2022, 1), 39.99)]          # ends Jan 2024
EQUINOX  = [((2024, 2), 85.00), ((2026, 1), 95.00), ((2027, 1), 105.00)]

# Per-year multiplier on all variable spend.  2023 is the baseline (1.00) so
# the previously-seeded 2023→2026 window keeps its original magnitudes.
INFLATION = {2020: 0.84, 2021: 0.88, 2022: 0.95, 2023: 1.00,
             2024: 1.03, 2025: 1.06, 2026: 1.09, 2027: 1.12}

# Gas is priced separately — it crashed in 2020 and spiked hard in 2022.
GAS_FACTOR = {2020: 0.62, 2021: 0.80, 2022: 1.22, 2023: 1.00,
              2024: 0.98, 2025: 1.00, 2026: 1.05, 2027: 1.08}

BONUSES = {2020: 2_500.00, 2021: 3_200.00, 2022: 3_600.00, 2023: 4_000.00,
           2024: 5_000.00, 2025: 5_500.00, 2026: 6_200.00, 2027: 6_800.00}

REFUNDS = {
    (2020, 4): (date(2020, 4, 24), 1_120.00),
    (2021, 5): (date(2021, 5, 14), 1_290.00),   # IRS pushed the 2021 deadline
    (2022, 4): (date(2022, 4,  8), 1_380.00),
    (2023, 4): (date(2023, 4, 18), 1_450.00),
    (2024, 3): (date(2024, 3, 22), 1_820.00),
    (2025, 4): (date(2025, 4, 11), 1_630.00),
    (2026, 3): (date(2026, 3, 28), 1_950.00),
    (2027, 4): (date(2027, 4,  9), 2_050.00),
}

# Federal pandemic relief payments
STIMULUS = [
    (date(2020, 4, 15), "IRS TREAS 310 ECON IMPACT PMT", "U.S. Treasury", 1_200.00),
    (date(2021, 1,  6), "IRS TREAS 310 ECON IMPACT PMT", "U.S. Treasury",   600.00),
    (date(2021, 3, 17), "IRS TREAS 310 ECON IMPACT PMT", "U.S. Treasury", 1_400.00),
]

TAX_SOFTWARE = {
    2020: ("TURBOTAX DELUXE 2019",  "TurboTax", 49.99, 14),
    2021: ("TURBOTAX DELUXE 2020",  "TurboTax", 54.99, 16),
    2022: ("TURBOTAX DELUXE 2021",  "TurboTax", 59.99, 10),
    2023: ("TURBOTAX DELUXE 2022",  "TurboTax", 64.99, 12),
    2024: ("TURBOTAX PREMIER 2023", "TurboTax", 84.99,  9),
    2025: ("TURBOTAX PREMIER 2024", "TurboTax", 84.99, 11),
    2026: ("TURBOTAX PREMIER 2025", "TurboTax", 94.99, 10),
    2027: ("TURBOTAX PREMIER 2026", "TurboTax", 99.99, 13),
}

# Monthly savings transfer range by year — grows with income
SAVINGS_RANGE = {
    2020: (350, 600), 2021: (450, 750),   2022: (500, 850),
    2023: (600, 900), 2024: (700, 1_050), 2025: (800, 1_200),
    2026: (900, 1_350), 2027: (1_000, 1_500),
}

# COVID windows
COVID_LOCKDOWN = {(2020, m) for m in range(3, 8)}          # Mar–Jul 2020
COVID_CAUTIOUS = ({(2020, m) for m in range(8, 13)} |      # Aug 2020–Mar 2021
                  {(2021, m) for m in range(1, 4)})
COVID_PAY_CUT  = {(2020, m) for m in range(4, 8)}          # 8% temporary cut

# ── Pre-defined anomalies ─────────────────────────────────────────────────────
# (year, month, day, desc, merchant, amount, category, reason)
ANOMALIES = [
    # ── 2020 — pandemic year ──────────────────────────────────────────────
    (2020, 3, 14,
     "COSTCO WHOLESALE PANDEMIC STOCKUP", "Costco Wholesale", 684.00, "Groceries",
     "Grocery charge is 5.1× your average Groceries transaction; single largest "
     "grocery run on record — bulk stock-up as lockdowns began"),
    (2020, 4, 3,
     "BEST BUY HOME OFFICE SETUP", "Best Buy", 1340.00, "Shopping",
     "Shopping charge is 11.8× your average Shopping transaction; monitor + desk "
     "chair purchase in the first week of remote work"),
    (2020, 9, 22,
     "DELL.COM WORKSTATION", "Dell", 1780.00, "Shopping",
     "Merchant first seen in dataset; largest Shopping charge of 2020 — "
     "no comparable electronics spend in prior 8 months"),
    (2020, 11, 27,
     "AMAZON.COM*BF ELECTRONICS 2020", "Amazon.com", 980.00, "Shopping",
     "Largest Amazon charge to date; 8.4× your average Amazon transaction — "
     "Black Friday spending pattern"),

    # ── 2021 — recovery year ──────────────────────────────────────────────
    (2021, 2, 9,
     "MIDTOWN ENDODONTICS ROOT CANAL", "Midtown Endodontics", 1890.00, "Healthcare",
     "Healthcare charge is 15.2× your median; specialist not previously seen — "
     "far exceeds any prior dental spend"),
    (2021, 7, 2,
     "DELTA AIR LINES ROUNDTRIP", "Delta Air Lines", 612.00, "Travel",
     "First Travel charge in 18 months; no Travel category spend since "
     "the pandemic began"),
    (2021, 7, 3,
     "AIRBNB * HHDXKQ2M", "Airbnb", 1420.00, "Travel",
     "Lodging charge one day after airline ticket; combined 2-day Travel spend "
     "is the highest on record at that point"),
    (2021, 11, 26,
     "WAYFAIR HOME FURNISHINGS", "Wayfair", 1265.00, "Shopping",
     "Merchant not seen in prior 12 months; amount exceeds the 97th percentile "
     "for Shopping — Black Friday furniture purchase"),

    # ── 2022 — inflation + car replacement ────────────────────────────────
    (2022, 3, 4,
     "TOYOTA OF HENDRICK DOWN PMT", "Toyota Dealership", 4500.00, "Transportation",
     "Largest single charge in the dataset to date; 10.9× your total typical "
     "monthly Transportation spend — vehicle down payment"),
    (2022, 8, 6,
     "HAWAIIAN AIRLINES HNL RT", "Hawaiian Airlines", 1180.00, "Travel",
     "Travel charge is 1.9× your prior largest flight purchase; "
     "no Travel spend in prior 11 months"),
    (2022, 8, 7,
     "MARRIOTT WAIKIKI RESORT 6NT", "Marriott", 2380.00, "Travel",
     "Resort charge one day after flight; combined 2-day Travel total of $3,560 "
     "is the highest travel event on record"),
    (2022, 11, 25,
     "BEST BUY BF OLED TV", "Best Buy", 1290.00, "Shopping",
     "Third consecutive Black Friday large-electronics charge; "
     "9.8× your average Best Buy transaction"),

    # ── 2023 ──────────────────────────────────────────────────────────────
    (2023, 6, 14,
     "TOYOTA OF HENDRICK SERVICE", "Toyota Dealership", 2840.00, "Transportation",
     "Dealer service charge is 9.2× your average Transportation transaction; "
     "transmission repair — single largest Transportation expense on record"),
    # Aug 2023 Las Vegas trip now lives in VACATIONS
    (2023, 11, 24,
     "AMAZON.COM*BLACK FRIDAY TV", "Amazon.com", 1847.00, "Shopping",
     "Largest Amazon charge in dataset; 11.2× your average Amazon transaction"),
    (2023, 11, 24,
     "BEST BUY MACBOOK AIR BF", "Best Buy", 1099.99, "Shopping",
     "Second large Shopping charge on Black Friday; "
     "combined daily Shopping of $2,947 is highest single-day spend on record"),
    (2023, 12, 21,
     "NORDSTROM HOLIDAY GIFTS", "Nordstrom", 890.00, "Shopping",
     "Nordstrom not seen in prior 12 months; amount exceeds 96th percentile "
     "for Shopping — elevated holiday-season pattern"),

    # ── 2024 ──────────────────────────────────────────────────────────────
    # Feb 2024 knee injury now lives in HEALTH_EPISODES
    (2024, 5, 11,
     "APPLE STORE MACBOOK PRO M3", "Apple Store", 2499.00, "Shopping",
     "Highest single Shopping transaction on record; Apple Store not seen "
     "in prior 13 months — large electronics purchase"),
    (2024, 7, 18,
     "HOME DEPOT WASHER DRYER", "Home Depot", 1599.99, "Shopping",
     "Home Depot charge is 11.4× your average Home Depot transaction; "
     "major appliance purchase — no similar spend in prior 15 months"),
    (2024, 10, 15,
     "STUBHUB VIP CONCERT TICKETS", "StubHub", 1240.00, "Entertainment",
     "Entertainment charge is 9.3× your median; VIP ticket purchase — "
     "merchant not seen in prior 8 months"),
    (2024, 11, 29,
     "AMAZON.COM*BF ELECTRONICS", "Amazon.com", 2140.00, "Shopping",
     "Fifth consecutive Black Friday large Amazon charge; "
     "amount is 13× average Amazon transaction, exceeds prior BF spend"),
    (2024, 12, 20,
     "NORDSTROM HOLIDAY PURCHASE", "Nordstrom", 1920.00, "Shopping",
     "Second Nordstrom appearance (first was Dec 2023); amount is highest "
     "December Shopping charge outside of Black Friday window"),

    # ── 2025 ──────────────────────────────────────────────────────────────
    # Mar 2025 dental implant now lives in HEALTH_EPISODES
    # Jun 2025 Paris trip now lives in VACATIONS
    (2025, 9, 12,
     "NEWEGG COMPUTER PARTS", "Newegg", 1380.00, "Shopping",
     "Merchant first seen in dataset; large tech spend with no similar "
     "purchase in 18-month window"),
    (2025, 9, 12,
     "AMAZON.COM*PC COMPONENTS", "Amazon.com", 960.00, "Shopping",
     "Large Amazon charge same day as Newegg; combined $2,340 tech spend "
     "is 2nd highest single-day Shopping total on record"),

    # ── 2026 ──────────────────────────────────────────────────────────────
    (2026, 1, 5,
     "PELOTON BIKE PURCHASE", "Peloton Interactive", 1445.00, "Shopping",
     "Fitness equipment in January — New Year resolution pattern; "
     "highest single January transaction on record"),
    (2026, 1, 6,
     "DICKS SPORTING GOODS GEAR", "Dick's Sporting Goods", 680.00, "Shopping",
     "Second large fitness purchase within 24 hours; combined January "
     "fitness spend far exceeds any prior January"),
    (2026, 3, 18,
     "EMERGENCY PLUMBING & DRAIN", "Emergency Plumbing Services LLC", 2100.00, "Utilities",
     "Utilities charge is 14.2× your average Utilities transaction; "
     "emergency after-hours service — out-of-band payment pattern"),
    # Jul 2026 Maui trip now lives in VACATIONS
    (2026, 9, 19,
     "APPLE STORE IPHONE 18 PRO", "Apple Store", 1480.00, "Shopping",
     "Apple Store not seen in prior 28 months; charge is 12.1× your average "
     "Shopping transaction — device upgrade cycle"),
    (2026, 11, 27,
     "AMAZON.COM*BF HOME THEATER", "Amazon.com", 1880.00, "Shopping",
     "Seventh consecutive Black Friday large Amazon charge; 11.4× your average "
     "Amazon transaction"),
    (2026, 12, 19,
     "NORDSTROM HOLIDAY GIFTING", "Nordstrom", 1340.00, "Shopping",
     "Third Nordstrom December appearance; recurring holiday-gifting pattern "
     "with amount in the 98th percentile for Shopping"),

    # ── 2027 ──────────────────────────────────────────────────────────────
    (2027, 2, 11,
     "HENDRICK TOYOTA MAJOR SERVICE", "Toyota Dealership", 1940.00, "Transportation",
     "Dealer service charge is 6.3× your average Transportation transaction; "
     "60k-mile service on a 5-year-old vehicle"),
    (2027, 5, 14,
     "ANA AIRLINES TOKYO RT", "ANA All Nippon Airways", 2480.00, "Travel",
     "Largest airfare charge on record; international flight — no Travel "
     "spend in prior 10 months"),
    (2027, 5, 16,
     "PARK HYATT TOKYO 6NT", "Park Hyatt Tokyo", 2780.00, "Travel",
     "Second large Travel charge in the same week; combined trip Travel of "
     "$5,260 is on par with the 2025 Paris trip"),
    (2027, 5, 19,
     "SUKIYABASHI JIRO GINZA", "Sukiyabashi Jiro", 640.00, "Food & Drink",
     "Restaurant spend is 11.4× your average Food & Drink transaction; "
     "fine dining inside an active international Travel cluster"),
    (2027, 8, 25,
     "APPLE STORE MACBOOK PRO M6", "Apple Store", 2899.00, "Shopping",
     "Second-highest Shopping transaction on record; 3-year laptop replacement "
     "cycle (prior: MacBook Pro M3, May 2024)"),
    (2027, 10, 7,
     "LASIK VISION INSTITUTE", "LASIK Vision Institute", 2400.00, "Healthcare",
     "Healthcare charge is 17× your median; elective procedure — provider not "
     "previously seen in the dataset"),
    (2027, 11, 26,
     "BEST BUY BF APPLIANCE PKG", "Best Buy", 1890.00, "Shopping",
     "Eighth consecutive Black Friday large-electronics charge; "
     "14.3× your average Best Buy transaction"),
    (2027, 12, 18,
     "TIFFANY & CO ENGAGEMENT RING", "Tiffany & Co.", 5200.00, "Shopping",
     "Largest single transaction in the entire dataset; merchant never seen "
     "before and amount is 39× your average Shopping transaction"),
]


# ── Helpers ───────────────────────────────────────────────────────────────────
def month_end(y, m):
    """Last calendar day of month, capped at END."""
    first_next = (date(y, m, 28) + timedelta(days=4)).replace(day=1)
    return min(first_next - timedelta(days=1), END)


def sched(table, y, m):
    """Value in force for (y, m) from an ascending ((y,m), value) table."""
    val = None
    for (sy, sm), v in table:
        if (y, m) >= (sy, sm):
            val = v
        else:
            break
    return val


def rnd(lo, hi):
    return round(random.uniform(lo, hi), 2)


def infl(y, lo, hi):
    """Random amount in [lo, hi] scaled by that year's inflation factor."""
    f = INFLATION[y]
    return round(random.uniform(lo, hi) * f, 2)


def days_in_month(y, m):
    """Calendar length of the month, ignoring the END cap."""
    first_next = (date(y, m, 28) + timedelta(days=4)).replace(day=1)
    return (first_next - timedelta(days=1)).day


def rand_day(y, m, lo=1, hi=None):
    """Random day in [lo, hi], clipped to END.

    Returns None when the requested window sits entirely past END — the final
    month of a seed is normally partial, so a bill dated the 16th simply has
    not happened yet. Callers pass the result straight to debit()/credit(),
    which drop None.
    """
    ceiling = month_end(y, m).day
    hi = min(hi or ceiling, ceiling)
    if lo > hi:
        return None
    return date(y, m, random.randint(lo, hi))


def home_day(y, m, lo=1, hi=None):
    """Like rand_day(), but None if the day falls inside a vacation.

    Dropping the transaction rather than re-rolling the day is deliberate: it
    thins the home-city baseline in proportion to the days spent away, which
    is what actually happens. Re-rolling would just shuffle the same spend
    into the days on either side of the trip.
    """
    d = rand_day(y, m, lo, hi)
    return None if d is None or d in AWAY_DAYS else d


def scaled(n, frac):
    """Scale a whole-month transaction count to a partial month.

    The remainder is resolved by a coin flip so that, say, 15 dining trips in
    a month that is 1/30 elapsed yields 0 or 1 rather than always rounding to
    the same value.
    """
    if frac >= 1.0:
        return n
    exact = n * frac
    whole = int(exact)
    return whole + (1 if random.random() < exact - whole else 0)


def paycheck_amount(pay_date):
    """Bi-weekly take-home; raises each January, 8% COVID cut Apr–Jul 2020."""
    base = sched(PAY_BASE, pay_date.year, pay_date.month)
    if (pay_date.year, pay_date.month) in COVID_PAY_CUT:
        base *= 0.92
    return round(base + random.uniform(-28, 28), 2)


def anomaly_score():
    return round(random.uniform(0.79, 0.97), 4)


def build_trip_rows():
    """Expand VACATIONS into per-month charges and populate AWAY_DAYS.

    Returns (year, month) → [(date, desc, merchant, amount, category,
    is_anomaly, score, reason)]. Runs before the monthly loop so that the
    home-city generators can already see AWAY_DAYS.
    """
    out: dict = {}

    def add(d, desc, merch, amount, cat, reason=None):
        if d < START or d > END:
            return
        out.setdefault((d.year, d.month), []).append(
            (d, desc, merch, amount, cat,
             bool(reason), anomaly_score() if reason else None, reason))

    for trip in VACATIONS:
        start, span = trip["start"], trip["days"]

        # Only the days actually on the trip count as "away" — the flight is
        # usually booked weeks earlier, while still at home.
        for offset in range(span):
            AWAY_DAYS.add(start + timedelta(days=offset))

        for offset, desc, merch, amount, cat, reason in trip["fixed"]:
            add(start + timedelta(days=offset), desc, merch, amount, cat, reason)

        # Dining and transport repeat — you eat out and move around all week.
        # Outings and souvenirs are drawn without replacement: you visit the
        # Louvre once, not twice.
        n_transport, n_dining, n_outings, n_shopping = trip["counts"]
        for pool, count, repeats in ((trip["transport"], n_transport, True),
                                     (trip["dining"],    n_dining,    True),
                                     (trip["outings"],   n_outings,   False),
                                     (trip["shopping"],  n_shopping,  False)):
            if not pool:
                continue
            picks = ([random.choice(pool) for _ in range(count)] if repeats
                     else random.sample(pool, min(count, len(pool))))
            for desc, merch, cat, lo, hi in picks:
                day = start + timedelta(days=random.randint(0, span - 1))
                add(day, desc, merch, infl(day.year, lo, hi), cat)

    return out


def build_health_rows():
    """Expand HEALTH_EPISODES into per-month charges.

    Same return shape as build_trip_rows(). Only the initial spike carries an
    anomaly reason; the follow-up visits, therapy course and refills are
    ordinary charges, which is what makes the episode read as real care rather
    than a lone outlier.
    """
    out: dict = {}

    def add(d, desc, merch, amount, cat, reason=None):
        if d < START or d > END:
            return
        out.setdefault((d.year, d.month), []).append(
            (d, desc, merch, amount, cat,
             bool(reason), anomaly_score() if reason else None, reason))

    for ep in HEALTH_EPISODES:
        onset = ep["onset"]
        for offset, desc, merch, amount, cat, reason in ep["visits"]:
            add(onset + timedelta(days=offset), desc, merch, amount, cat, reason)

        for first, every, count, desc, merch, lo, hi in ep.get("recurring", []):
            for i in range(count):
                day = onset + timedelta(days=first + i * every)
                add(day, desc, merch, infl(day.year, lo, hi), "Healthcare")

    return out


def build_budgets(rows, months=12):
    """Per-category monthly budgets for the last `months` of the window.

    Each budget is the trailing 3-month mean actual for that category, jittered
    ±10-15% and rounded to $25. Anchoring to real spend is what makes
    budget-vs-actual interesting: most months land close, and the months
    holding a vacation or a medical episode blow through Travel, Food & Drink
    and Healthcare on their own.
    """
    excluded = {"Income", "Transfer"}
    actual: dict = {}
    for tx_date, _desc, _merch, amount, cat, tx_type, *_rest in rows:
        if tx_type != "DEBIT" or cat in excluded:
            continue
        bucket = actual.setdefault((tx_date.year, tx_date.month), {})
        bucket[cat] = bucket.get(cat, 0.0) + float(amount)

    out = []
    for (y, m) in sorted(actual)[-months:]:
        prior = []
        for back in (1, 2, 3):
            py, pm = y, m - back
            while pm < 1:
                py, pm = py - 1, pm + 12
            if (py, pm) in actual:
                prior.append(actual[(py, pm)])
        if not prior:
            continue

        categories = set().union(*(p.keys() for p in prior))
        for cat in sorted(categories):
            mean = sum(p.get(cat, 0.0) for p in prior) / len(prior)
            if mean < 20:          # not worth budgeting a category you barely use
                continue
            amount = mean * random.uniform(0.90, 1.15)
            out.append((cat, f"{y}-{m:02d}", max(25.0, round(amount / 25) * 25.0)))

    return out


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    # DATABASE_URL (e.g. the Neon connection string) takes precedence; libpq
    # parses sslmode / channel_binding directly. Falls back to the local DB dict.
    db_url = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(db_url) if db_url else psycopg2.connect(**DB)
    cur  = conn.cursor()

    # ── 1. Upsert user ─────────────────────────────────────────────────────
    pw_hash = bcrypt.hashpw(b"test", bcrypt.gensalt(rounds=10)).decode()
    cur.execute("""
        INSERT INTO users
            (email, password_hash, first_name, last_name, monthly_income, created_at)
        VALUES (%s, %s, 'Alex', 'Chen', 7500.00, NOW())
        ON CONFLICT (email) DO UPDATE
            SET password_hash = EXCLUDED.password_hash
        RETURNING id
    """, ("test@gmail.com", pw_hash))
    user_id = cur.fetchone()[0]
    print(f"User id={user_id}  (test@gmail.com / test)")

    # ── 2. Wipe all existing data for this user ─────────────────────────────
    # Coach tips and reports are cleared but NOT regenerated here — they are
    # written by the app through Gemma, and hand-seeding them is exactly how
    # the previous dataset ended up with tips citing categories that did not
    # exist in the transactions. ./warm_app_data.sh regenerates them for real.
    cur.execute("DELETE FROM coach_task_completions WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM coach_completions      WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM coach_tips             WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM transactions           WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM financial_reports      WHERE user_id = %s", (user_id,))
    cur.execute("DELETE FROM budgets                WHERE user_id = %s", (user_id,))
    print("Cleared prior data.")

    # ── 3. Anomaly lookup  (year,month) → [(day,desc,merch,amt,cat,reason)] ─
    #   Keyed by month so they can be injected inside the monthly loop and
    #   share the same upload_batch_id as that month's regular transactions.
    anom_lookup: dict = {}
    for ay, am, ad, desc, merch, amt, cat, reason in ANOMALIES:
        anom_lookup.setdefault((ay, am), []).append((ad, desc, merch, amt, cat, reason))

    stim_lookup: dict = {}
    for sd, sdesc, smerch, samt in STIMULUS:
        stim_lookup.setdefault((sd.year, sd.month), []).append((sd, sdesc, smerch, samt))

    # Vacations and health episodes span month boundaries, so they are expanded
    # up front and keyed by month like the anomalies. build_trip_rows() also
    # fills AWAY_DAYS, which the monthly loop reads via home_day().
    trip_lookup   = build_trip_rows()
    health_lookup = build_health_rows()

    rows = []   # (date, desc, merch, amount, cat, tx_type, is_anom, score, reason, batch)

    def debit(d, desc, merch, amount, cat,
              is_anom=False, score=None, reason=None, batch=None):
        # d is None when a generator's day window lies past END, or when the
        # day fell inside a vacation. Both mean "this did not happen".
        if d is None or d > END:
            return
        rows.append((d, desc, merch, amount, cat,
                     "DEBIT", is_anom, score, reason, batch or _batch))

    def credit(d, desc, merch, amount, cat, batch=None):
        if d is None or d > END:
            return
        rows.append((d, desc, merch, amount, cat,
                     "CREDIT", False, None, None, batch or _batch))

    # ── 4. Generate all transactions month by month ────────────────────────
    #   Income (CREDIT) is generated within each month's batch so that
    #   creditTotal and debitTotal are correct per batch in the API.

    # First Friday on or after START
    days_to_friday = (4 - START.weekday()) % 7
    pay_date = START + timedelta(days=days_to_friday)

    cur_month = START.replace(day=1)
    while cur_month <= END:
        y, m = cur_month.year, cur_month.month
        me = month_end(y, m)
        _batch = uuid.uuid4().hex[:8]

        # Fraction of the month that has actually elapsed. Normally 1.0; on the
        # final month it shrinks the random-day counts, so a seed run on the
        # 1st doesn't dump a whole month of restaurant visits onto day one.
        elapsed = me.day / days_in_month(y, m)

        is_holiday  = m in {11, 12}
        is_summer   = m in {6, 7, 8}
        is_winter   = m in {12, 1, 2}
        lockdown    = (y, m) in COVID_LOCKDOWN
        cautious    = (y, m) in COVID_CAUTIOUS

        # ── PAYCHECKS falling in this month (same batch as expenses) ──────
        while pay_date.year == y and pay_date.month == m and pay_date <= me:
            credit(pay_date, "DIR DEP NEXUS SOFTWARE INC", "Nexus Software Inc",
                   paycheck_amount(pay_date), "Income")
            pay_date += timedelta(days=14)

        # ── YEAR-END BONUS ────────────────────────────────────────────────
        if m == 12 and y in BONUSES:
            bonus_date = date(y, m, 20)
            if bonus_date <= END:
                credit(bonus_date, "NEXUS SOFTWARE ANNUAL BONUS", "Nexus Software Inc",
                       BONUSES[y], "Income")

        # ── TAX REFUND ────────────────────────────────────────────────────
        if (y, m) in REFUNDS:
            refund_date, refund_amt = REFUNDS[(y, m)]
            if refund_date <= END:
                credit(refund_date, "IRS TAX REFUND", "U.S. Treasury",
                       refund_amt, "Income")

        # ── PANDEMIC STIMULUS ─────────────────────────────────────────────
        for sd, sdesc, smerch, samt in stim_lookup.get((y, m), []):
            credit(sd, sdesc, smerch, samt, "Income")

        # ── RENT ──────────────────────────────────────────────────────────
        debit(date(y, m, 1), "RENT PAYMENT APT 12C", "Harborview Properties",
              sched(RENT, y, m), "Housing")

        # ── CAR LOAN ──────────────────────────────────────────────────────
        # 2018 Honda Civic financed through Feb 2022, then a 2022 Toyota Camry XSE
        if (y, m) <= (2022, 2):
            debit(date(y, m, 5), "HONDA FINANCIAL SERVICES", "Honda Financial Services",
                  rnd(334, 342), "Transportation")
        else:
            debit(date(y, m, 5), "TOYOTA FINANCIAL SERVICES", "Toyota Financial Services",
                  rnd(408, 418), "Transportation")

        # ── CAR INSURANCE ─────────────────────────────────────────────────
        debit(date(y, m, 3), "STATE FARM AUTO INSURANCE", "State Farm",
              sched(CAR_INSURANCE, y, m), "Transportation")

        # ── RENTER'S INSURANCE ────────────────────────────────────────────
        debit(date(y, m, 3), "LEMONADE RENTERS INS", "Lemonade Insurance",
              sched(RENTERS_INSURANCE, y, m), "Utilities")

        # ── SUBSCRIPTIONS ─────────────────────────────────────────────────
        debit(date(y, m,  4), "NETFLIX.COM", "Netflix", sched(NETFLIX, y, m), "Entertainment")
        debit(date(y, m,  6), "SPOTIFY USA", "Spotify", sched(SPOTIFY, y, m), "Entertainment")
        debit(date(y, m,  8), "AMAZON PRIME MEMBERSHIP", "Amazon", sched(PRIME, y, m), "Shopping")
        debit(date(y, m, 11), "APPLE.COM/BILL", "Apple", sched(ICLOUD, y, m), "Entertainment")

        if (disney := sched(DISNEY, y, m)) is not None:
            debit(date(y, m, 13), "DISNEY PLUS SUBSCRIPTION", "Disney+", disney, "Entertainment")
        if (hbo := sched(HBOMAX, y, m)) is not None:
            debit(date(y, m, 19), "HBO MAX SUBSCRIPTION", "HBO Max", hbo, "Entertainment")
        if (yt := sched(YOUTUBE, y, m)) is not None:
            debit(date(y, m, 22), "YOUTUBE PREMIUM", "Google", yt, "Entertainment")

        # Gym: Gold's until Jan 2024 (closed Apr–Jun 2020), then Equinox
        if (y, m) <= (2024, 1):
            if not (y == 2020 and m in {4, 5, 6}):   # membership frozen during closure
                debit(date(y, m, 16), "GOLDS GYM MEMBERSHIP", "Gold's Gym",
                      sched(GYM_OLD, y, m), "Healthcare")
        elif (eq := sched(EQUINOX, y, m)) is not None:
            debit(date(y, m, 16), "EQUINOX FITNESS CLUB", "Equinox Fitness", eq, "Healthcare")

        # ── UTILITIES ─────────────────────────────────────────────────────
        # Working from home in 2020–21 pushed electric usage up noticeably
        wfh_bump = 1.18 if (lockdown or cautious) else 1.0
        electric = (infl(y, 165, 235) if is_summer
                    else infl(y, 140, 210) if is_winter
                    else infl(y, 95, 148))
        debit(rand_day(y, m, 2, 9), "DUKE ENERGY ELECTRIC", "Duke Energy",
              round(electric * wfh_bump, 2), "Utilities")

        gas_bill = infl(y, 95, 165) if is_winter else infl(y, 28, 68)
        debit(rand_day(y, m, 3, 10), "PIEDMONT NATURAL GAS", "Piedmont Natural Gas",
              gas_bill, "Utilities")

        debit(rand_day(y, m, 6, 13), "COMCAST XFINITY INTERNET", "Comcast",
              sched(INTERNET, y, m), "Utilities")
        debit(rand_day(y, m, 7, 16), "VERIZON WIRELESS", "Verizon",
              sched(PHONE, y, m), "Utilities")

        if m % 2 == 1:  # water billed every other month
            debit(rand_day(y, m, 9, 18), "CITY WATER & SEWER", "City Water Services",
                  infl(y, 52, 88), "Utilities")

        # ── GROCERIES ─────────────────────────────────────────────────────
        # Lockdown = fewer but much bigger trips; cautious era = still elevated
        if lockdown:
            n_grocery, g_mult = random.randint(4, 6), 1.45
        elif cautious:
            n_grocery, g_mult = random.randint(5, 7), 1.20
        else:
            n_grocery, g_mult = random.randint(5, 9), 1.00
        n_grocery = scaled(n_grocery, elapsed)
        g_days = sorted(random.sample(range(1, me.day + 1), min(n_grocery, me.day)))
        for gd in g_days:
            if date(y, m, gd) in AWAY_DAYS:      # no home grocery runs while away
                continue
            desc, cat, merch, lo, hi = random.choice(GROCERY_STORES)
            debit(date(y, m, gd), desc, merch, round(infl(y, lo, hi) * g_mult, 2), cat)

        # ── DINING OUT ────────────────────────────────────────────────────
        if lockdown:
            pool, n_dining = COVID_RESTAURANTS, random.randint(4, 9)
        elif cautious:
            pool, n_dining = RESTAURANTS, random.randint(7, 12)
        else:
            pool = RESTAURANTS
            n_dining = (random.randint(18, 26) if (is_summer or m == 2)
                        else random.randint(14, 20) if is_holiday
                        else random.randint(10, 17))
        for _ in range(scaled(n_dining, elapsed)):
            desc, cat, merch, lo, hi = random.choice(pool)
            debit(home_day(y, m), desc, merch, infl(y, lo, hi), cat)

        # ── GAS  (fill-ups track commuting; price tracks the market) ──────
        if lockdown:
            n_fill = random.randint(1, 2)
        elif cautious:
            n_fill = random.randint(2, 3)
        else:
            n_fill = random.randint(3, 5)
        gas_f = GAS_FACTOR[y]
        if y == 2022 and m in {5, 6, 7}:     # summer 2022 peak at the pump
            gas_f = 1.38
        for _ in range(scaled(n_fill, elapsed)):
            desc, cat, merch = random.choice(GAS_STATIONS)
            debit(home_day(y, m), desc, merch, round(rnd(55, 98) * gas_f, 2), cat)

        # ── AMAZON  (online shopping surged during lockdown) ──────────────
        if lockdown or cautious:
            n_amzn = random.randint(8, 16)
        elif is_holiday:
            n_amzn = random.randint(6, 14)
        else:
            n_amzn = random.randint(3, 7)
        # Amazon keeps running while away — it's ordering, not a trip out.
        for _ in range(scaled(n_amzn, elapsed)):
            desc, merch = random.choice(AMAZON_DESCS)
            debit(rand_day(y, m), desc, merch, infl(y, 18, 140), "Shopping")

        # ── RETAIL SHOPPING  (in-store trips collapsed during lockdown) ───
        n_retail = 1 if lockdown else random.randint(2, 5)
        for _ in range(scaled(n_retail, elapsed)):
            desc, cat, merch, lo, hi = random.choice(RETAIL_SHOPS)
            debit(home_day(y, m), desc, merch, infl(y, lo, hi), cat)

        # ── PHARMACY ──────────────────────────────────────────────────────
        if random.random() < (0.75 if (lockdown or cautious) else 0.45) * elapsed:
            desc, cat, merch = random.choice(PHARMA)
            debit(home_day(y, m), desc, merch, infl(y, 15, 75), cat)

        # ── ENTERTAINMENT ─────────────────────────────────────────────────
        # Theaters/venues were closed Mar 2020 → Mar 2021: games only
        ent_pool = COVID_ENTERTAINMENT if (lockdown or cautious) else ENTERTAINMENT_ITEMS
        if random.random() < (0.70 if (lockdown or cautious) else 0.60) * elapsed:
            desc, cat, merch, lo, hi = random.choice(ent_pool)
            debit(home_day(y, m), desc, merch, infl(y, lo, hi), cat)

        # ── PERSONAL CARE  (barbershops shut Apr–Jun 2020) ────────────────
        if not (y == 2020 and m in {4, 5, 6}) and random.random() < 0.85 * elapsed:
            desc, cat, merch, lo, hi = random.choice(PERSONAL_CARE)
            debit(home_day(y, m, 5, 25), desc, merch, infl(y, lo, hi), cat)

        # ── MONTHLY SAVINGS TRANSFER ──────────────────────────────────────
        s_lo, s_hi = SAVINGS_RANGE[y]
        debit(rand_day(y, m, 25, 28),
              "TRANSFER TO VANGUARD BROKERAGE", "Vanguard",
              rnd(s_lo, s_hi), "Transfer")

        # ── QUARTERLY OIL CHANGE / CAR SERVICE ───────────────────────────
        if m in {1, 4, 7, 10} and not lockdown:
            debit(rand_day(y, m, 5, 20),
                  "JIFFY LUBE SERVICE #0482", "Jiffy Lube",
                  infl(y, 78, 135), "Transportation")

        # ── SEMI-ANNUAL DENTAL CLEANING  (offices closed spring 2020) ─────
        if m in {4, 10} and not lockdown:
            debit(rand_day(y, m, 8, 22),
                  "BRIGHT SMILE DENTAL OFFICE", "Bright Smile Dental",
                  infl(y, 195, 265), "Healthcare")

        # ── SEASONAL ONE-OFFS ─────────────────────────────────────────────

        # Valentine's Day (February 14)
        if m == 2 and me.day >= 14:
            debit(date(y, m, 14),
                  "TELEFLORA FLOWERS DELIVERY", "Teleflora",
                  infl(y, 80, 160), "Shopping")
            debit(date(y, m, 14),
                  "VALENTINES DINNER RESY", "OpenTable Restaurant",
                  infl(y, 110, 200), "Food & Drink")

        # Tax software (April)
        if m == 4 and y in TAX_SOFTWARE:
            d_desc, d_merch, d_amt, d_day = TAX_SOFTWARE[y]
            debit(date(y, m, d_day), d_desc, d_merch, d_amt, "Shopping")

        # Back-to-school (August)
        if m == 8:
            debit(rand_day(y, m, 12, 26), "STAPLES STORE #1234", "Staples",
                  infl(y, 55, 145), "Shopping")

        # Holiday cards + wrapping (December)
        if m == 12:
            debit(rand_day(y, m, 8, 18), "HALLMARK GOLD CROWN",
                  "Hallmark", infl(y, 22, 58), "Shopping")
            if me.day >= 24:
                # Dec 2020 Christmas was a stay-at-home affair
                if y == 2020:
                    debit(date(y, m, 24), "CHRISTMAS EVE GROCERY RUN", "Whole Foods Market",
                          infl(y, 90, 150), "Groceries")
                else:
                    debit(date(y, m, 24), "CHRISTMAS EVE DINNER", "STK Steakhouse",
                          infl(y, 140, 240), "Food & Drink")
            if me.day == 31 and y != 2020:
                debit(date(y, m, 31), "NEW YEARS EVE PARTY", "NYE Venue",
                      infl(y, 80, 160), "Entertainment")

        # Spring deep-clean / home supplies (March)
        if m == 3:
            debit(rand_day(y, m, 7, 20), "TARGET HOME DEPT", "Target",
                  infl(y, 65, 175), "Shopping")

        # Summer outdoor activities (June / July)
        if m in {6, 7} and not lockdown:
            debit(rand_day(y, m, 5, 25), "REI CO-OP #0482", "REI",
                  infl(y, 45, 185), "Shopping")
            debit(rand_day(y, m, 8, 28), "NATIONAL PARK RECREATION",
                  "Recreation.gov", infl(y, 28, 75), "Entertainment")

        # ── VACATION + HEALTH EPISODE charges falling in this month ────────
        #   Pre-expanded above; emitted here so they share the month's batch.
        for tx_date, desc, merch, amt, cat, is_anom, score, reason in (
                trip_lookup.get((y, m), []) + health_lookup.get((y, m), [])):
            debit(tx_date, desc, merch, amt, cat,
                  is_anom=is_anom, score=score, reason=reason)

        # ── ANOMALIES for this month (same batch as regular transactions) ───
        for ad, desc, merch, amt, cat, reason in anom_lookup.get((y, m), []):
            debit(date(y, m, ad), desc, merch, amt, cat,
                  is_anom=True, score=anomaly_score(), reason=reason)

        # ── Advance to next month ──────────────────────────────────────────
        cur_month = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)

    # ── 5. Batch insert ─────────────────────────────────────────────────────
    print(f"Inserting {len(rows)} transactions …")

    payload = []
    for (tx_date, desc, merch, amount, cat,
         tx_type, is_anom, score, reason, batch) in rows:
        conf = None if tx_type == "CREDIT" else round(random.uniform(0.85, 0.99), 3)
        payload.append((
            user_id, desc, merch, amount, tx_date,
            cat, conf, tx_type,
            is_anom, score if is_anom else None, reason,
            batch, f"{tx_date},{desc},{amount}",
        ))

    execute_values(cur, """
        INSERT INTO transactions (
            user_id, description, merchant_name, amount, transaction_date,
            category, category_confidence, transaction_type,
            is_anomaly, anomaly_score, anomaly_reason,
            upload_batch_id, raw_csv_row, created_at
        ) VALUES %s
    """, payload,
        template="(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())",
        page_size=500)

    # ── 5b. Budgets, derived from the spend just generated ──────────────────
    budgets = build_budgets(rows)
    print(f"Inserting {len(budgets)} budgets …")
    execute_values(cur, """
        INSERT INTO budgets (user_id, category, month, budget_amount, created_at)
        VALUES %s
    """, [(user_id, cat, month, amt) for cat, month, amt in budgets],
        template="(%s,%s,%s,%s,NOW())")

    conn.commit()
    cur.close()
    conn.close()

    # ── 6. Summary ─────────────────────────────────────────────────────────
    n_credit = sum(1 for r in rows if r[5] == "CREDIT")
    n_debit  = sum(1 for r in rows if r[5] == "DEBIT")
    n_anom   = sum(1 for r in rows if r[6])
    months   = len({(r[0].year, r[0].month) for r in rows})

    by_year: dict = {}
    for r in rows:
        y = r[0].year
        agg = by_year.setdefault(y, [0, 0.0, 0.0])
        agg[0] += 1
        if r[5] == "CREDIT":
            agg[1] += float(r[3])
        else:
            agg[2] += float(r[3])

    print("=" * 62)
    print("Seed complete!")
    print(f"  Login        : test@gmail.com / test")
    print(f"  User ID      : {user_id}")
    print(f"  Period       : {START} → {END}  ({months} months)")
    print(f"  Total rows   : {len(rows)}")
    print(f"    Income (CREDIT) : {n_credit}  (bi-weekly pay + bonuses + refunds + stimulus)")
    print(f"    Expense (DEBIT) : {n_debit}")
    print(f"    Anomalies       : {n_anom}")
    n_travel = sum(1 for r in rows if r[4] == "Travel")
    n_health = sum(1 for r in rows if r[4] == "Healthcare")
    trips    = sum(1 for t in VACATIONS if START <= t["start"] <= END)
    episodes = sum(1 for e in HEALTH_EPISODES if START <= e["onset"] <= END)
    print(f"    Travel rows     : {n_travel}  ({trips} vacations, "
          f"{len(AWAY_DAYS)} days away)")
    print(f"    Healthcare rows : {n_health}  ({episodes} health episodes)")
    print(f"    Budgets         : {len(budgets)}")
    print("-" * 62)
    print(f"  {'Year':<6}{'Rows':>7}{'Income':>14}{'Spend':>14}{'Net':>14}")
    for yr in sorted(by_year):
        n, inc, spd = by_year[yr]
        print(f"  {yr:<6}{n:>7}{inc:>14,.0f}{spd:>14,.0f}{inc - spd:>14,.0f}")
    print("-" * 62)
    print(f"  App URL      : http://localhost:3000")


if __name__ == "__main__":
    main()
