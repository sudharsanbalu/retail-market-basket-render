"""
==========================================================
 SAMPLE RETAIL DATASET GENERATOR
==========================================================
Generates a realistic retail transaction dataset with strong,
meaningful product combinations so that the Apriori / FP-Growth
algorithms produce useful association rules.

Run this file once to create (or refresh) the sample dataset:

    python data/generate_sample_data.py
"""

import csv
import datetime
import os
import random

random.seed(42)  # reproducible sample data

# ------------------------------------------------------------------
# Product catalogue
# category -> list of products. Items appearing later are the
# "lead" products of their group and get higher base probability.
# ------------------------------------------------------------------
CATALOGUE = {
    "Dairy":             ["Milk", "Butter", "Curd", "Cheese"],
    "Bakery":            ["Bread", "Buns", "Cake", "Cookies"],
    "Poultry & Protein": ["Eggs", "Paneer"],
    "Beverages":         ["Coffee", "Tea", "Juice"],
    "Snacks":            ["Biscuits", "Chips", "Chocolate"],
    "Grocery":           ["Rice", "Dal", "Cooking Oil", "Salt", "Sugar"],
    "Personal Care":     ["Shampoo", "Soap", "Toothpaste"],
}

# Price lookup
PRICES = {
    "Milk": 25, "Butter": 55, "Curd": 30, "Cheese": 90,
    "Bread": 30, "Buns": 20, "Cake": 120, "Cookies": 45,
    "Eggs": 60, "Paneer": 110,
    "Coffee": 180, "Tea": 120, "Juice": 40,
    "Biscuits": 25, "Chips": 20, "Chocolate": 50,
    "Rice": 70, "Dal": 90, "Cooking Oil": 140, "Salt": 20, "Sugar": 45,
    "Shampoo": 130, "Soap": 35, "Toothpaste": 60,
}

# Highly-likely together combinations (these create strong rules)
COMBO_GROUPS = [
    ["Milk", "Bread", "Butter", "Eggs"],          # breakfast
    ["Milk", "Bread", "Butter"],                  # toast + milk
    ["Coffee", "Biscuits", "Sugar"],              # coffee break
    ["Tea", "Sugar", "Biscuits"],                 # tea time
    ["Rice", "Dal", "Cooking Oil", "Salt"],       # cooking staples
    ["Bread", "Eggs", "Butter"],                  # egg toast
    ["Shampoo", "Soap", "Toothpaste"],            # personal care
    ["Chips", "Chocolate", "Juice"],              # snack time
    ["Milk", "Coffee", "Sugar"],                  # milk coffee
    ["Bread", "Jam" if False else "Butter", "Juice"],
]

PRODUCT_NAMES = [p for prods in CATALOGUE.values() for p in prods]
CATEGORY_OF = {}
for cat, prods in CATALOGUE.items():
    for p in prods:
        CATEGORY_OF[p] = cat

# Catalogue pool for random extra items (everything except heavy groceries)
RANDOM_POOL = [p for p in PRODUCT_NAMES if p not in ("Cooking Oil", "Rice", "Dal")]


def pick_combo():
    """Pick one base combo group, then decide how much of it to buy."""
    group = random.choice(COMBO_GROUPS)
    # Sometimes only part of the combo is purchased together
    k = random.choice([2, 3, 3, 4])
    selected = random.sample(group, min(k, len(group)))
    return selected


def pick_random_items():
    """Add 0-2 random filler products."""
    count = random.choice([0, 0, 1, 1, 2])
    items = set()
    for _ in range(count):
        items.add(random.choice(RANDOM_POOL))
    return list(items)


def generate_transactions(num_rules=65, num_customers=45):
    """Create one record per (customer, transaction, product)."""
    rows = []
    start_date = datetime.date(2025, 6, 1)
    today = datetime.date(2025, 12, 31)
    days = (today - start_date).days

    tx_counter = 1
    for _ in range(num_rules):
        customer = random.randint(1001, 1000 + num_customers)

        # 2-4 distinct shopping sessions ("baskets") per customer
        for _ in range(random.randint(2, 4)):
            for _ in range(random.randint(1, 3)):
                date = start_date + datetime.timedelta(days=random.randint(0, days))
                txn_date = f"{date.year}-{date.month:02d}-{date.day:02d}"

                basket = pick_combo()
                basket += pick_random_items()
                basket = list(dict.fromkeys(basket))  # remove duplicates

                txid = f"T{tx_counter:05d}"
                tx_counter += 1

                for product in basket:
                    qty = random.choice([1, 1, 1, 2, 2, 3])
                    price = PRICES[product]
                    rows.append([
                        txid, f"C{customer}", txn_date, product,
                        qty, price, CATEGORY_OF[product],
                    ])
    return rows


def main():
    rows = [["TransactionID", "CustomerID", "Date", "Product", "Quantity", "Price", "Category"]]
    rows += generate_transactions()

    out_path = os.path.join(os.path.dirname(__file__), "sample_retail_data.csv")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    print(f"Sample dataset written to {out_path}")
    print(f"Total line items: {len(rows) - 1}")


if __name__ == "__main__":
    main()