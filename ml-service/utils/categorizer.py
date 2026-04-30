"""
Transaction Categorizer
TF-IDF vectorizer + Logistic Regression classifier
Trained on common merchant name patterns.
"""

import re
import numpy as np
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

# Keyword-based fallback rules (quick wins before ML)
KEYWORD_RULES = {
    "Food & Drink":      ["starbucks", "mcdonald", "subway", "chipotle", "doordash", "uber eats",
                          "grubhub", "restaurant", "cafe", "pizza", "burger", "sushi", "taco"],
    "Groceries":         ["walmart", "kroger", "safeway", "whole foods", "trader joe", "aldi",
                          "publix", "costco", "target grocery", "supermarket"],
    "Transport":         ["uber", "lyft", "gas station", "shell", "bp", "exxon", "chevron",
                          "parking", "mta", "metro", "transit", "toll"],
    "Shopping":          ["amazon", "ebay", "etsy", "best buy", "apple store", "nike", "h&m",
                          "zara", "target", "walmart", "costco"],
    "Entertainment":     ["netflix", "spotify", "hulu", "disney", "youtube", "steam", "cinema",
                          "movie", "concert", "ticketmaster", "amc"],
    "Healthcare":        ["pharmacy", "cvs", "walgreens", "hospital", "clinic", "doctor",
                          "dental", "vision", "health"],
    "Utilities":         ["electric", "water", "gas utility", "internet", "at&t", "verizon",
                          "comcast", "xfinity", "t-mobile"],
    "Rent & Housing":    ["rent", "mortgage", "landlord", "property management", "airbnb", "vrbo"],
    "Travel":            ["airline", "hotel", "marriott", "hilton", "expedia", "booking.com",
                          "delta", "united", "american airlines"],
    "Financial":         ["bank fee", "atm", "interest", "loan", "insurance", "premium"],
    "Subscriptions":     ["subscription", "monthly", "annual plan", "membership"],
    "Personal Care":     ["salon", "spa", "barbershop", "beauty", "sephora", "ulta"],
}

# Training data (description → category)
TRAINING_DATA = [
    ("starbucks coffee 1234",          "Food & Drink"),
    ("mcdonalds 4523",                 "Food & Drink"),
    ("doordash dash123",               "Food & Drink"),
    ("whole foods market",             "Groceries"),
    ("kroger grocery store",           "Groceries"),
    ("uber trip 9am",                  "Transport"),
    ("shell gas station",              "Transport"),
    ("amazon prime purchase",          "Shopping"),
    ("best buy electronics",           "Shopping"),
    ("netflix monthly",                "Entertainment"),
    ("spotify premium",                "Entertainment"),
    ("cvs pharmacy",                   "Healthcare"),
    ("walgreens rx",                   "Healthcare"),
    ("con edison electric bill",       "Utilities"),
    ("at&t wireless",                  "Utilities"),
    ("rent payment march",             "Rent & Housing"),
    ("delta airlines ticket",          "Travel"),
    ("marriott hotel stay",            "Travel"),
    ("bank service fee",               "Financial"),
    ("gym membership",                 "Subscriptions"),
    ("supercuts haircut",              "Personal Care"),
]


def _preprocess(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    return text.strip()


class TransactionCategorizer:
    def __init__(self):
        descriptions = [_preprocess(d) for d, _ in TRAINING_DATA]
        labels       = [c for _, c in TRAINING_DATA]

        self.pipeline = Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), min_df=1)),
            ("clf",   LogisticRegression(max_iter=500, C=5.0)),
        ])
        self.pipeline.fit(descriptions, labels)

    def predict(self, description: str, amount: float = 0) -> tuple[str, float]:
        clean = _preprocess(description)

        # Rule-based override first
        for category, keywords in KEYWORD_RULES.items():
            if any(kw in clean for kw in keywords):
                return category, 0.99

        # ML prediction
        proba = self.pipeline.predict_proba([clean])[0]
        idx   = int(np.argmax(proba))
        return self.pipeline.classes_[idx], float(proba[idx])


_categorizer_instance = None

def get_categorizer() -> TransactionCategorizer:
    global _categorizer_instance
    if _categorizer_instance is None:
        _categorizer_instance = TransactionCategorizer()
    return _categorizer_instance
