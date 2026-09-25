"""
============================================================================
 RETAIL MARKET BASKET ANALYSIS & PRODUCT RECOMMENDATION SYSTEM
============================================================================
Backend Flask application.

Project flow:
    Upload Dataset -> Data Preprocessing -> Sales Analytics
    -> Transaction / Basket Creation -> Apriori / FP-Growth
    -> Frequent Itemsets -> Association Rules (Support / Confidence / Lift)
    -> Product Recommendations -> Smart Combo Offers -> Interactive Dashboard
    -> Report Generation

Run:
    python app.py
Then open http://127.0.0.1:5000 in your browser.
"""

import os
import re
import json
import datetime
import sqlite3
import io

import numpy as np
import pandas as pd

from flask import (
    Flask, render_template, request, jsonify,
    send_file, send_from_directory, url_for,
)

from mlxtend.frequent_patterns import apriori, association_rules, fpgrowth

# ------------------------------------------------------------------
# CONFIGURATION
# ------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Render: mount a persistent disk and point DATA_DIR at it so the
# uploaded datasets + SQLite database survive restarts / redeploys.
DATA_DIR = os.environ.get("DATA_DIR") or BASE_DIR
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
SAMPLE_CSV = os.path.join(BASE_DIR, "data", "sample_retail_data.csv")
DB_PATH = os.path.join(DATA_DIR, "database.db")

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # max upload 50 MB

APP_TITLE = "Retail Market Basket Analysis & Product Recommendation System"

# ------------------------------------------------------------------
# DATABASE HELPERS
# ------------------------------------------------------------------
def get_connection():
    """Open a fresh SQLite connection each time (avoids thread issues)."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the database tables if they do not exist yet."""
    conn = get_connection()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS transactions (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id TEXT NOT NULL,
            customer_id    TEXT NOT NULL,
            date           TEXT,
            product        TEXT NOT NULL,
            quantity       TEXT,
            price          TEXT,
            total_amount   TEXT,
            category       TEXT
        );

        CREATE TABLE IF NOT EXISTS products (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name TEXT UNIQUE NOT NULL,
            category     TEXT,
            price        TEXT
        );

        CREATE TABLE IF NOT EXISTS customers (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS association_rules (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            antecedent  TEXT NOT NULL,
            consequent  TEXT NOT NULL,
            support     TEXT,
            confidence  TEXT,
            lift        TEXT
        );
        """
    )
    conn.commit()
    conn.close()


def clear_transactions():
    """Empty every analytical table (used before loading a new dataset)."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM transactions")
    cur.execute("DELETE FROM products")
    cur.execute("DELETE FROM customers")
    cur.execute("DELETE FROM association_rules")
    conn.commit()
    conn.close()


# ------------------------------------------------------------------
# DATA LOADING
# ------------------------------------------------------------------
def load_transactions_df():
    """Load all transaction records from SQLite into a pandas DataFrame."""
    conn = get_connection()
    df = pd.read_sql_query("SELECT * FROM transactions", conn)
    conn.close()
    if df.empty:
        return df
    # Convert to useful dtypes (results of preprocessing are already clean)
    for col in ("quantity", "price", "total_amount"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    return df


def seed_sample_data():
    """Load the bundled sample CSV into the database on first run,
    so the application is instantly demo-ready."""
    if not os.path.exists(SAMPLE_CSV):
        return False
    try:
        process_and_store(SAMPLE_CSV, source="sample")
        return True
    except Exception:
        return False


# ------------------------------------------------------------------
# PREPROCESSING PIPELINE
# ------------------------------------------------------------------
COLUMN_ALIASES = {
    "transaction_id": ["transactionid", "transid", "invoiceno", "invoice no", "orderid", "order id", "billno", "txnid", "transaction no"],
    "customer_id":    ["customerid", "custid", "customer", "client", "customer no", "clientid", "userid"],
    "date":           ["date", "transactiondate", "invoicedate", "orderdate", "purchasedate", "datetime", "purchase date", "billdate"],
    "product":        ["product", "item", "productname", "description", "itemname", "product name", "product desc", "item description"],
    "quantity":       ["quantity", "qty", "units", "unit", "qty.", "quantity sold"],
    "price":          ["price", "unitprice", "priceeach", "sellingprice", "rate", "unit price", "amount", "mrp"],
    "category":       ["category", "type", "group", "department", "product category", "item type"],
}


def resolve_column(name):
    """Map a messy column name to a standard column using aliases."""
    clean = str(name).strip().lower().replace("_", " ").replace("-", " ")
    clean = re.sub(r"\s+", " ", clean)
    for standard, aliases in COLUMN_ALIASES.items():
        if clean in [a.lower() for a in aliases]:
            return standard
    return None


def clean_product_name(value):
    """Normalise a product name: strip spaces, title case, fix spacing."""
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[_\-]+", " ", text)
    return text.strip().title()


def preprocess_df(raw_df, source_name=""):
    """Full data-cleaning pipeline.

    Returns (clean_df, summary_dict) where summary describes what
    was removed during cleaning.
    """
    summary = {"original_records": len(raw_df)}

    # ---------- 1. Standardise column names ---------------------------
    rename_map = {}
    for col in raw_df.columns:
        standard = resolve_column(col)
        if standard and standard not in rename_map.values():
            rename_map[col] = standard
    df = raw_df.rename(columns=rename_map)

    # ---------- 2. Missing-value handling -----------------------------
    required = ["transaction_id", "customer_id", "date", "product"]
    numeric = ["quantity", "price"]

    missing_cols = [c for c in required if c not in df.columns]
    if missing_cols:
        raise ValueError(
            "Missing required column(s): " + ", ".join(missing_cols) +
            ". Expected columns like: TransactionID, CustomerID, Date, "
            "Product, Quantity, Price, Category."
        )

    # Drop rows that cannot be used at all
    df = df.dropna(subset=[c for c in required if c in df.columns])

    # Fill missing categories with "Other"
    if "category" in df.columns:
        df["category"] = df["category"].fillna("Other")
    else:
        df["category"] = "Other"

    # ---------- 3. Fill sensible defaults for numbers -----------------
    if "quantity" not in df.columns:
        df["quantity"] = 1
    if "price" not in df.columns:
        df["price"] = 0
    for c in ("quantity", "price"):
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # Remove invalid numerical values (negative / zero quantities,
    # negative prices). This also handles non-numeric garbage.
    df = df[df["quantity"] > 0]
    df = df[df["price"] >= 0]

    # ---------- 4. Date conversion -------------------------------------
    df["date"] = pd.to_datetime(df["date"], errors="coerce", dayfirst=False)
    df = df.dropna(subset=["date"])

    # ---------- 5. Product name cleaning -------------------------------
    df["product"] = df["product"].map(clean_product_name)
    df = df[df["product"].astype(str).str.len() > 0]

    # ---------- 6. Remove duplicate records ----------------------------
    df = df.drop_duplicates(
        subset=["transaction_id", "customer_id", "date", "product"]
    )

    # ---------- 7. Total amount calculation ----------------------------
    df["total_amount"] = (df["quantity"] * df["price"]).round(2)

    # ---------- 8. String standardisation ------------------------------
    df["transaction_id"] = df["transaction_id"].astype(str).str.strip()
    df["customer_id"] = df["customer_id"].astype(str).str.strip()
    df["category"] = df["category"].astype(str).str.strip().str.title()

    summary["cleaned_records"] = len(df)
    summary["removed_records"] = summary["original_records"] - len(df)
    summary["unique_transactions"] = df["transaction_id"].nunique()
    summary["unique_customers"] = df["customer_id"].nunique()
    summary["unique_products"] = df["product"].nunique()
    summary["source"] = source_name or "Dataset"
    return df, summary


def process_and_store(file_path, source="upload"):
    """Preprocess a CSV/XLSX file, then write results into SQLite.

    Returns the cleaning summary + a JSON-able preview.
    """
    if file_path.lower().endswith((".xlsx", ".xls")):
        raw = pd.read_excel(file_path)
    else:
        raw = pd.read_csv(file_path, encoding_errors="replace")

    if raw.empty:
        raise ValueError("The uploaded file contains no data rows.")

    df, summary = preprocess_df(raw, source_name=source)

    if df.empty:
        raise ValueError(
            "The file could not be cleaned into valid transactions. Check that "
            "dates parse correctly and quantity/price are numbers."
        )

    # Remove any previous dataset so we always analyse the newest one
    clear_transactions()

    conn = get_connection()
    cur = conn.cursor()

    rows = df[["transaction_id", "customer_id", "date", "product",
               "quantity", "price", "total_amount", "category"]].values.tolist()
    cur.executemany(
        """INSERT INTO transactions
           (transaction_id, customer_id, date, product,
            quantity, price, total_amount, category)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [(r[0], r[1], r[2].strftime("%Y-%m-%d") if pd.notna(r[2]) else None,
          r[3], float(r[4]), float(r[5]), float(r[6]), r[7]) for r in rows],
    )

    # products table
    prod_rows = (df.groupby(["product", "category"])["price"].mean()
                 .reset_index().values.tolist())
    cur.executemany(
        "INSERT OR IGNORE INTO products (product_name, category, price) VALUES (?, ?, ?)",
        prod_rows,
    )

    # customers table
    cur.executemany(
        "INSERT OR IGNORE INTO customers (customer_id) VALUES (?)",
        [(cid,) for cid in df["customer_id"].unique()],
    )
    conn.commit()
    conn.close()

    preview = df.tail(50).astype({
        "quantity": "int64",
        "price": "float64",
        "total_amount": "float64",
    }).to_dict(orient="records")
    for row in preview:
        row["date"] = str(row["date"].date())
    return summary, preview


# ------------------------------------------------------------------
# SALES ANALYTICS
# ------------------------------------------------------------------
def _filter_by_range(df, range_key, start=None, end=None):
    """Filter the transaction frame by a date range (relative to the
    dataset's most recent transaction, so it works even for older data)."""
    if df.empty:
        return df
    today = df["date"].max().normalize()
    if range_key == "today":
        mask = df["date"].dt.normalize() == today
    elif range_key == "this_week":
        mask = df["date"] >= today - pd.Timedelta(days=today.weekday())
    elif range_key == "last_7":
        mask = df["date"] >= today - pd.Timedelta(days=7)
    elif range_key == "last_30":
        mask = df["date"] >= today - pd.Timedelta(days=30)
    elif range_key == "this_month":
        mask = df["date"] >= today.replace(day=1)
    elif range_key == "custom":
        if start and end:
            try:
                s, e = pd.to_datetime(start), pd.to_datetime(end)
            except Exception:
                return df
            mask = (df["date"] >= s) & (df["date"] <= e)
        else:
            return df
    else:  # all / default
        return df
    return df[mask]


def compute_sales_analytics(df):
    """Calculate all sales metric + chart data for a filtered frame."""
    if df.empty:
        empty = {
            "total_revenue": 0, "total_quantity": 0,
            "avg_transaction_value": 0, "num_transactions": 0,
        }
        return empty, {}, {}

    total_revenue = float(df["total_amount"].sum())
    total_qty = float(df["quantity"].sum())
    num_tx = int(df["transaction_id"].nunique())
    avg_tx_value = total_revenue / num_tx if num_tx else 0

    metrics = {
        "total_revenue": round(total_revenue, 2),
        "total_quantity": round(total_qty, 2),
        "avg_transaction_value": round(avg_tx_value, 2),
        "num_transactions": num_tx,
    }

    charts = {}

    # Daily sales
    daily = (df.groupby(df["date"].dt.date)["total_amount"]
             .sum().reset_index())
    daily.columns = ["date", "revenue"]
    charts["daily"] = daily.to_dict(orient="records")

    # Monthly sales
    monthly = (df.groupby(df["date"].dt.to_period("M"))["total_amount"]
               .sum().reset_index())
    monthly["month"] = monthly["date"].astype(str)
    charts["monthly"] = (
        monthly[["month", "total_amount"]]
        .rename(columns={"total_amount": "revenue"})
        .to_dict(orient="records")
    )

    # Top 10 products by revenue (also carry quantity + transaction counts)
    top = (df.groupby("product").agg(
        revenue=("total_amount", "sum"),
        quantity=("quantity", "sum"),
        transactions=("transaction_id", "nunique"),
    ).reset_index().sort_values("revenue", ascending=False).head(10))
    charts["top_products"] = top.to_dict(orient="records")

    # Category-wise sales (count of items + revenue)
    cat = df.groupby("category").agg(
        items=("product", "count"),
        revenue=("total_amount", "sum"),
    ).reset_index().sort_values("revenue", ascending=False)
    charts["categories"] = cat.to_dict(orient="records")

    # Quantity by product (top 10)
    qty = (df.groupby("product")["quantity"].sum()
           .reset_index().sort_values("quantity", ascending=False).head(10))
    charts["quantity_by_product"] = qty.to_dict(orient="records")

    return metrics, charts, {
        "min_date": str(df["date"].min().date()),
        "max_date": str(df["date"].max().date()),
    }


# ------------------------------------------------------------------
# MARKET BASKET ANALYSIS (Apriori / FP-Growth)
# ------------------------------------------------------------------
def build_baskets(df):
    """Convert transaction records into a one-hot basket matrix.

    Rows = transactions, Columns = products, value 1/0 whether the
    product appears in that transaction.
    """
    grouped = df.groupby(["transaction_id", "product"]).size()
    basket = grouped.unstack(fill_value=0)
    # bool dtype is what MLxtend expects for best performance
    basket = (basket > 0).astype(bool)
    return basket


def run_basket_analysis(min_support=0.01, min_confidence=0.30,
                        min_lift=1.0, algorithm="apriori"):
    """Run frequent-itemset + association-rule mining with MLxtend.

    Returns a dictionary ready for JSON serialisation.
    """
    df = load_transactions_df()
    if df.empty:
        raise ValueError("no_data")

    if not (0 < min_support <= 1):
        raise ValueError("Minimum support must be between 0 and 1.")
    if not (0 < min_confidence <= 1):
        raise ValueError("Minimum confidence must be between 0 and 1.")
    if min_lift <= 0:
        raise ValueError("Minimum lift must be greater than 0.")

    basket = build_baskets(df)
    n_transactions = int(basket.shape[0])

    # ---- Frequent itemsets ---------------------------------------
    if algorithm == "fpgrowth":
        itemsets = fpgrowth(basket, min_support=min_support, use_colnames=True)
    else:
        itemsets = apriori(basket, min_support=min_support, use_colnames=True)

    if itemsets.empty:
        raise ValueError("no_rules")

    itemsets = itemsets.sort_values("support", ascending=False).reset_index(drop=True)

    # ---- Association rules ----------------------------------------
    rules = association_rules(itemsets, metric="lift", min_threshold=min_lift)
    if rules.empty:
        raise ValueError("no_rules")

    rules = rules[rules["confidence"] >= min_confidence].copy()
    if rules.empty:
        raise ValueError("no_rules")

    def fmt(items):
        return sorted([str(i) for i in items])

    # ---- Frequent itemsets result ---------------------------------
    itemset_rows = []
    for _, row in itemsets.iterrows():
        itemset_rows.append({
            "id": len(itemset_rows) + 1,
            "items": fmt(row["itemsets"]),
            "size": len(row["itemsets"]),
            "support": round(float(row["support"]), 4),
            "transactions": int(round(float(row["support"]) * n_transactions)),
        })

    # ---- Rules result ---------------------------------------------
    rule_rows = []
    scatter = []
    for _, r in rules.iterrows():
        ante = fmt(r["antecedents"])
        cons = fmt(r["consequents"])
        support = round(float(r["support"]), 4)
        confidence = round(float(r["confidence"]), 4)
        lift = round(float(r["lift"]), 4)
        rule_rows.append({
            "id": len(rule_rows) + 1,
            "antecedent": ante,
            "consequent": cons,
            "antecedent_str": " + ".join(ante),
            "consequent_str": " + ".join(cons),
            "support": support,
            "confidence": confidence,
            "lift": lift,
            "transactions": int(round(support * n_transactions)),
        })
        scatter.append({"x": confidence, "y": support, "r": lift,
                        "rule": f"{' + '.join(ante)} → {' + '.join(cons)}"})

    stats = {
        "n_transactions": n_transactions,
        "n_products": int(basket.shape[1]),
        "n_itemsets": int(len(itemsets)),
        "n_rules": int(len(rule_rows)),
        "max_itemset_size": int(itemsets["itemsets"].apply(len).max()),
    }

    top_rules = sorted(rule_rows, key=lambda r: r["lift"], reverse=True)[:60]

    # Network edges for visualisation (top rules by lift)
    edges = [{
        "source": r["antecedent_str"],
        "target": r["consequent_str"],
        "lift": r["lift"],
        "confidence": r["confidence"],
        "support": r["support"],
    } for r in sorted(rule_rows, key=lambda r: r["lift"], reverse=True)[:80]]

    nodes = {}
    for e in edges:
        nodes.setdefault(e["source"], {"lift": e["lift"], "confidence": e["confidence"]})
        nodes.setdefault(e["target"], {"lift": e["lift"], "confidence": e["confidence"]})
    nodes = [{"id": k, "lift": v["lift"], "confidence": v["confidence"]} for k, v in nodes.items()]

    return {
        "algorithm": algorithm,
        "min_support": min_support,
        "min_confidence": min_confidence,
        "min_lift": min_lift,
        "stats": stats,
        "itemsets": itemset_rows,
        "rules": rule_rows,
        "top_rules": top_rules,
        "scatter": scatter,
        "network": {"nodes": nodes, "edges": edges},
    }


# ------------------------------------------------------------------
# PRODUCT RECOMMENDATIONS
# ------------------------------------------------------------------
def store_rules(rules):
    """Persist the last generated rules so other modules reuse them."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM association_rules")
    for r in rules:
        cur.execute(
            """INSERT INTO association_rules
               (antecedent, consequent, support, confidence, lift)
               VALUES (?, ?, ?, ?, ?)""",
            (" + ".join(r["antecedent"]), " + ".join(r["consequent"]),
             r["support"], r["confidence"], r["lift"]),
        )
    conn.commit()
    conn.close()


def get_rules(min_support=0.01, min_confidence=0.30, min_lift=1.0,
              algorithm="apriori"):
    """Retrieve rules from DB; run analysis with defaults if none exist."""
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM association_rules")
    rows = cur.fetchall()
    conn.close()
    if rows:
        rules = []
        for r in rows:
            ante = r["antecedent"].split(" + ")
            cons = r["consequent"].split(" + ")
            rules.append({
                "id": r["id"],
                "antecedent": ante,
                "consequent": cons,
                "antecedent_str": " + ".join(ante),
                "consequent_str": " + ".join(cons),
                "support": float(r["support"]),
                "confidence": float(r["confidence"]),
                "lift": float(r["lift"]),
            })
        return rules
    # Nothing stored yet -> generate and store
    result = run_basket_analysis(min_support, min_confidence, min_lift, algorithm)
    store_rules(result["rules"])
    return result["rules"]


def recommend_for_product(product, top_n=6):
    """Recommend products using the actual association rules.

    Rules used:
      - rules where this product is in the antecedent  -> consequents
      - rules where this product is in the consequent  -> antecedents

    Scoring rewards direct product -> product rules (single antecedent /
    single consequent) and strong support/confidence/lift. Never random.
    """
    rules = get_rules()
    product = product.strip().lower()
    scored = {}

    def remember(other, rec, score):
        if other in scored and scored[other]["_score"] >= score:
            return
        rec["_score"] = score
        scored[other] = rec

    for r in rules:
        ante, cons = r["antecedent"], r["consequent"]
        a_has = product in [a.lower() for a in ante]
        c_has = product in [b.lower() for b in cons]
        if not (a_has or c_has):
            continue

        others = cons if a_has else ante
        if not others:
            continue

        for other in others:
            if other.lower() == product:
                continue
            # Slight penalty for messy multi-item rules
            penalties = (len(others) - 1) * 0.7 + (len(ante if a_has else cons) - 1) * 0.3
            # Bonus for clean "Product -> Recommended" (or reciprocal) rules
            bonus = 5.0 if (a_has and len(ante) == 1 and len(cons) == 1) else (
                2.5 if (c_has and len(cons) == 1 and len(ante) == 1) else 0.0)
            score = (r["support"] * 100 + 1) * r["confidence"] * r["lift"] / (1 + penalties)
            score += bonus

            remember(other, {
                "product": other,
                "support": r["support"],
                "confidence": r["confidence"],
                "lift": r["lift"],
                "rule": f"{r['antecedent_str']} → {r['consequent_str']}",
            }, score)

    ranked = sorted(scored.values(), key=lambda c: c["_score"], reverse=True)[:top_n]

    # Build human-readable reasons from real numbers
    for c in ranked:
        c.pop("_score", None)
        c["confidence_pct"] = round(c["confidence"] * 100, 1)
        c["support_pct"] = round(c["support"] * 100, 1)
        c["lift"] = round(c["lift"], 2)
        c["strength"] = "Strong" if c["lift"] >= 1.5 else ("Moderate" if c["lift"] >= 1.0 else "Weak")
        c["reason"] = (
            f"Customers who purchase {product.title()} very often buy "
            f"{c['product']} too — they appear together in "
            f"{c['support_pct']}% of all transactions. "
            f"When {product.title()} is bought, {c['product']} is bought "
            f"{c['confidence_pct']}% of the time, and a lift of {c['lift']} "
            f"means the association is much stronger than random chance."
        )
    return ranked


# ------------------------------------------------------------------
# COMBO OFFER GENERATOR
# ------------------------------------------------------------------
COMBO_NAMES = {
    "breakfast": "Breakfast Combo",
    "snack": "Snack Time Combo",
    "bakery": "Bakery Favourites Combo",
    "tea": "Tea-Time Combo",
    "hygiene": "Daily Hygiene Kit",
    "grocery": "Kitchen Staples Combo",
    "beverage": "Drinks & Refresh Combo",
    "default": "Frequently Bought Together Combo",
}

COMBO_KEYWORDS = {
    "Breakfast Combo": ["milk", "bread", "butter", "eggs", "curd", "cheese", "paneer"],
    "Snack Time Combo": ["chips", "chocolate", "biscuits", "juice", "cookies"],
    "Tea-Time Combo": ["tea", "coffee", "sugar", "biscuits"],
    "Daily Hygiene Kit": ["shampoo", "soap", "toothpaste"],
    "Kitchen Staples Combo": ["rice", "dal", "cooking oil", "salt", "sugar"],
}


def suggest_combo_name(products):
    """Pick a suitable combo name based on the product keywords."""
    names = []
    for combo_name, keywords in COMBO_KEYWORDS.items():
        hits = [p for p in products if any(k in p.lower() for k in keywords)]
        if len(hits) >= max(2, len(products) - 1):
            names.append((combo_name, len(hits)))
    if names:
        return max(names, key=lambda x: x[1])[0]
    return COMBO_NAMES["default"]


def generate_combos(min_support=0.01, min_confidence=0.30, min_lift=1.0,
                    algorithm="apriori", n_combos=6):
    """Build combo offers from frequent itemsets / association rules."""
    result = run_basket_analysis(min_support, min_confidence, min_lift, algorithm)
    rules = result["rules"]

    # Candidate combos: frequent itemsets of size >= 2
    candidates = [isr for isr in result["itemsets"] if isr["size"] >= 2]

    # Map rule union -> list of (confidence, lift) so we can attach metrics
    rule_union = {}
    for r in rules:
        key = frozenset(r["antecedent"] + r["consequent"])
        rule_union.setdefault(key, []).append(r)

    combos = []
    used_products = set()
    for isr in sorted(candidates, key=lambda x: (x["size"], x["support"]), reverse=True):
        combo_products = isr["items"]
        key = frozenset(combo_products)
        matches = [r for r in rules
                   if frozenset(r["antecedent"] + r["consequent"]) == key]
        if matches:
            best = max(matches, key=lambda r: r["lift"])
            confidence, lift = best["confidence"], best["lift"]
        else:
            # fall back to itemset-level support statistics
            confidence, lift = isr["support"], 1.0

        # Skip combos whose products are already fully covered
        if used_products.issuperset(set(combo_products)):
            continue
        combos.append({
            "id": len(combos) + 1,
            "products": combo_products,
            "support": round(isr["support"] * 100, 1),
            "confidence": round(confidence * 100, 1),
            "lift": round(lift, 2),
            "name": suggest_combo_name(combo_products),
            "message": (
                f"These products are frequently purchased together — bundle "
                f"them for a limited-time offer and increase basket size."
            ),
        })
        used_products.update(combo_products)
        if len(combos) >= n_combos:
            break
    return combos


# ------------------------------------------------------------------
# CUSTOMER SEGMENTATION
# ------------------------------------------------------------------
def customer_segments(df):
    """Simple, data-driven customer segmentation.

    High Value   -> top 25% by total spend
    Frequent     -> not high value, but in top 25% by order count
    Occasional   -> at least 2 orders
    Low Activity -> single order
    """
    if df.empty:
        return {}, [], {}

    cust = (df.groupby("customer_id")
            .agg(orders=("transaction_id", "nunique"),
                 total_spend=("total_amount", "sum"),
                 avg_basket=("total_amount", "mean"),
                 distinct_products=("product", "nunique"),
                 last_order=("date", "max"))
            .reset_index())

    q75_spend = cust["total_spend"].quantile(0.75)
    q75_orders = cust["orders"].quantile(0.75)

    def segment(row):
        if row["total_spend"] >= q75_spend:
            return "High Value"
        if row["orders"] >= q75_orders:
            return "Frequent"
        if row["orders"] >= 2:
            return "Occasional"
        return "Low Activity"

    cust["segment"] = cust.apply(segment, axis=1)
    cust["last_order"] = cust["last_order"].dt.strftime("%Y-%m-%d")
    cust["total_spend"] = cust["total_spend"].round(2)
    cust["avg_basket"] = cust["avg_basket"].round(2)

    kpis = {
        "total_customers": int(len(cust)),
        "active_customers": int(cust["orders"].ge(2).sum()),
        "avg_purchases": round(float(cust["orders"].mean()), 2),
        "avg_spend": round(float(cust["total_spend"].mean()), 2),
    }

    segment_dist = (cust.groupby("segment").size()
                    .reset_index(name="count")
                    .to_dict(orient="records"))

    top_customers = (cust.sort_values("total_spend", ascending=False)
                     .head(10).to_dict(orient="records"))

    # spending distribution buckets
    counts, edges = np.histogram(cust["total_spend"], bins=8)
    distribution = [{
        "range": f"{int(edges[i]):,}–{int(edges[i+1]):,}",
        "count": int(counts[i]),
    } for i in range(len(counts))]

    return kpis, segment_dist, {
        "customers": cust.to_dict(orient="records"),
        "top_customers": top_customers,
        "distribution": distribution,
    }


# ------------------------------------------------------------------
# KEY INSIGHTS (generated strictly from calculated data)
# ------------------------------------------------------------------
def generate_insights(metrics, analytics_charts, segments, rules,
                      combo_insight=None):
    """Build short, truthful insight sentences from real computed numbers."""
    insights = []
    df = load_transactions_df()

    if rules:
        top = max(rules, key=lambda r: r["lift"])
        if len(top["antecedent"]) == 1 and len(top["consequent"]) == 1:
            insights.append(
                f"“{top['consequent_str']}” and “{top['antecedent_str']}” have the "
                f"strongest association with a lift of {top['lift']:.2f}."
            )
        else:
            insights.append(
                f"The strongest rule is “{top['antecedent_str']} → "
                f"{top['consequent_str']}” with a lift of {top['lift']:.2f}."
            )

        # Highest-support rule
        if rules:
            strong = max(rules, key=lambda r: r["support"])
            insights.append(
                f"Rule “{strong['antecedent_str']} → {strong['consequent_str']}” "
                f"has the highest support at {strong['support']*100:.1f}% of transactions."
            )

    if metrics and metrics.get("avg_transaction_value"):
        insights.append(
            f"Average basket value is ₹{metrics['avg_transaction_value']:,.2f} "
            f"across {metrics['num_transactions']:,} transactions."
        )

    # Category insight
    if analytics_charts and analytics_charts.get("categories"):
        top_cat = analytics_charts["categories"][0]
        insights.append(
            f"“{top_cat['category']}” is the highest-revenue category "
            f"(₹{top_cat['revenue']:,.0f})."
        )

    if analytics_charts and analytics_charts.get("top_products"):
        top_prod = analytics_charts["top_products"][0]
        insights.append(
            f"“{top_prod['product']}” is the top product by revenue "
            f"(₹{top_prod['revenue']:,.0f})."
        )

    if segments:
        seg = max(segments, key=lambda s: s["count"])["segment"]
        insights.append(
            f"Most customers fall into the “{seg}” segment "
            f"({max(segments, key=lambda s: s['count'])['count']:,} customers)."
        )

    if combo_insight:
        insights.append(combo_insight)

    if not df.empty:
        insights.append(
            f"Analysis is based on {df['transaction_id'].nunique():,} transactions, "
            f"{df['product'].nunique():,} products and "
            f"{df['customer_id'].nunique():,} customers."
        )

    return insights


# ------------------------------------------------------------------
# SEARCH (products / rules / customers / transactions)
# ------------------------------------------------------------------
def global_search(query):
    """Search products, customers, transactions and association rules."""
    q = query.strip().lower()
    if not q:
        return {"products": [], "rules": [], "customers": [], "transactions": []}

    df = load_transactions_df()

    products = []
    if not df.empty:
        matches = df[df["product"].str.lower().str.contains(q, na=False)]
        if not matches.empty:
            top = matches.groupby("product").agg(
                transactions=("transaction_id", "nunique"),
                revenue=("total_amount", "sum"),
            ).reset_index().sort_values("revenue", ascending=False).head(8)
            products = [{"name": r["product"], "transactions": int(r["transactions"]),
                         "revenue": round(float(r["revenue"]), 2)}
                        for _, r in top.iterrows()]

        tx_matches = df[df["transaction_id"].str.lower().str.contains(q, na=False)]
        transactions = [{"transaction_id": t[0], "customer_id": t[1], "date": str(t[2][:10])}
                        for t in tx_matches.drop_duplicates("transaction_id")
                        .head(5)[["transaction_id", "customer_id", "date"]].values]

        cust_matches = df[df["customer_id"].str.lower().str.contains(q, na=False)]
        customers = sorted(cust_matches["customer_id"].unique().tolist())[:5]
    else:
        transactions, customers = [], []

    rules = []
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM association_rules")
    for r in cur.fetchall():
        text = f"{r['antecedent']} -> {r['consequent']}".lower()
        if q in text:
            rules.append({
                "antecedent": r["antecedent"], "consequent": r["consequent"],
                "support": float(r["support"]), "confidence": float(r["confidence"]),
                "lift": round(float(r["lift"]), 2),
            })
        if len(rules) >= 6:
            break
    conn.close()

    return {"products": products, "rules": rules,
            "customers": customers, "transactions": transactions}


# ------------------------------------------------------------------
# FULL REPORT DATA
# ------------------------------------------------------------------
def build_report_data():
    """Assemble everything needed for the printable report."""
    df = load_transactions_df()
    has_data = not df.empty

    # Run analysis with default settings (also stores rules in DB)
    try:
        basket = run_basket_analysis(0.01, 0.30, 1.0, "apriori")
        store_rules(basket["rules"])
    except ValueError:
        basket = {"stats": {"n_rules": 0, "n_itemsets": 0},
                  "itemsets": [], "rules": [], "top_rules": []}
    except Exception:
        basket = {"stats": {"n_rules": 0, "n_itemsets": 0},
                  "itemsets": [], "rules": [], "top_rules": []}

    metrics, charts, _ = compute_sales_analytics(df)
    kpis, segments, seg_detail = customer_segments(df)

    recommendations_top = {}
    if basket["rules"]:
        for r in basket["rules"][:10]:
            ante = r["antecedent"][0] if r["antecedent"] else None
            if ante:
                recommendations_top[ante] = recommend_for_product(ante, 3)

    combos = []
    try:
        combos = generate_combos()
    except Exception:
        combos = []

    insights = generate_insights(
        metrics, charts, segments,
        basket.get("rules", []),
        combos[0]["name"] if combos else None,
    )

    return {
        "generated_at": datetime.datetime.now().strftime("%d %B %Y, %I:%M %p"),
        "app_title": APP_TITLE,
        "has_data": has_data,
        "dataset": {
            "records": len(df),
            "transactions": int(df["transaction_id"].nunique()) if has_data else 0,
            "products": int(df["product"].nunique()) if has_data else 0,
            "customers": int(df["customer_id"].nunique()) if has_data else 0,
            "period": (f"{str(df['date'].min().date())} → {str(df['date'].max().date())}"
                       if has_data else "-"),
        },
        "sales": {"metrics": metrics, "charts": charts},
        "basket": basket,
        "recommendations": recommendations_top,
        "combos": combos,
        "customers": {"kpis": kpis, "segments": segments,
                      "top_customers": seg_detail["top_customers"]},
        "insights": insights,
    }


def report_as_text(data):
    """Render the report as a plain-text document for download."""
    lines = []
    lines.append("=" * 72)
    lines.append(data["app_title"])
    lines.append("Generated: " + data["generated_at"])
    lines.append("=" * 72)

    lines.append("\n1. EXECUTIVE SUMMARY")
    lines.append("-" * 72)
    for ins in data["insights"]:
        lines.append("  • " + ins)

    lines.append("\n2. DATASET SUMMARY")
    lines.append("-" * 72)
    for k, v in data["dataset"].items():
        lines.append(f"  {k.replace('_', ' ').title():<14}: {v}")

    lines.append("\n3. SALES ANALYSIS")
    lines.append("-" * 72)
    for k, v in data["sales"]["metrics"].items():
        lines.append(f"  {k.replace('_', ' ').title():<26}: {v:,}".replace(",", ","))

    lines.append("\n4. ASSOCIATION RULES (TOP BY LIFT)")
    lines.append("-" * 72)
    for r in data["basket"]["top_rules"][:15]:
        lines.append(
            f"  {r['antecedent_str']} → {r['consequent_str']}   "
            f"support={r['support']:.3f} conf={r['confidence']:.3f} "
            f"lift={r['lift']:.2f}"
        )

    lines.append("\n5. PRODUCT RECOMMENDATIONS")
    lines.append("-" * 72)
    for prod, recs in list(data["recommendations"].items())[:6]:
        for rec in recs:
            lines.append(f"  {prod} → {rec['product']} "
                         f"(conf {rec['confidence_pct']}%, lift {rec['lift']})")

    lines.append("\n6. SUGGESTED COMBO OFFERS")
    lines.append("-" * 72)
    for c in data["combos"]:
        lines.append(f"  {c['name']}: {', '.join(c['products'])} "
                     f"(confidence {c['confidence']}%, lift {c['lift']})")

    lines.append("\n7. CUSTOMER ANALYSIS")
    lines.append("-" * 72)
    for k, v in data["customers"]["kpis"].items():
        lines.append(f"  {k.replace('_', ' ').title():<26}: {v}")
    for s in data["customers"]["segments"]:
        lines.append(f"  Segment '{s['segment']}': {s['count']} customers")

    lines.append("\n8. KEY FINDINGS")
    lines.append("-" * 72)
    for ins in data["insights"]:
        lines.append("  • " + ins)

    return "\n".join(lines)


# ------------------------------------------------------------------
# HTML TEMPLATE ROUTES
# ------------------------------------------------------------------

@app.context_processor
def _inject_static_v():
    """Version static assets by file mtime so browsers never serve a
    stale cached JS/CSS during development."""
    def static_v(path):
        try:
            full = os.path.join(app.static_folder, path.replace("/", os.sep))
            return url_for("static", filename=path,
                           v=int(os.path.getmtime(full)))
        except OSError:
            return url_for("static", filename=path)
    return dict(static_v=static_v)


@app.route("/")
def index():
    return render_template("dashboard.html", page="dashboard",
                           title="Dashboard", app_title=APP_TITLE)


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html", page="dashboard",
                           title="Dashboard", app_title=APP_TITLE)


@app.route("/upload")
def upload_page():
    return render_template("upload.html", page="upload",
                           title="Upload Dataset", app_title=APP_TITLE)


@app.route("/analytics")
def analytics_page():
    return render_template("analytics.html", page="analytics",
                           title="Sales Analytics", app_title=APP_TITLE)


@app.route("/basket-analysis")
def basket_page():
    return render_template("basket_analysis.html", page="basket",
                           title="Market Basket Analysis", app_title=APP_TITLE)


@app.route("/recommendations")
def recommendations_page():
    return render_template("recommendations.html", page="recommendations",
                           title="Product Recommendations", app_title=APP_TITLE)


@app.route("/combos")
def combos_page():
    return render_template("combos.html", page="combos",
                           title="Combo Offer Generator", app_title=APP_TITLE)


@app.route("/customers")
def customers_page():
    return render_template("customers.html", page="customers",
                           title="Customer Analysis", app_title=APP_TITLE)


@app.route("/products")
def products_page():
    return render_template("products.html", page="products",
                           title="Products", app_title=APP_TITLE)


@app.route("/reports")
def reports_page():
    return render_template("reports.html", page="reports",
                           title="Reports", app_title=APP_TITLE)


@app.route("/about")
def about_page():
    return render_template("about.html", page="about",
                           title="About Project", app_title=APP_TITLE)


# ------------------------------------------------------------------
# API ROUTES
# ------------------------------------------------------------------
@app.route("/api/dashboard")
def api_dashboard():
    df = load_transactions_df()
    has_data = not df.empty

    if not has_data:
        return jsonify({"has_data": False, "message": "No dataset uploaded yet."})

    metrics, charts, _ = compute_sales_analytics(df)
    kpis, segments, _ = customer_segments(df)

    revenue = metrics["total_revenue"]
    tx_count = int(df["transaction_id"].nunique())
    kpis2 = {
        "total_transactions": tx_count,
        "total_customers": int(df["customer_id"].nunique()),
        "total_products": int(df["product"].nunique()),
        "total_revenue": round(revenue, 2),
        "avg_order_value": round(revenue / tx_count, 2) if tx_count else 0,
        "top_product": None,
    }
    if not df.empty:
        top = (df.groupby("product")["total_amount"].sum()
               .idxmax())
        kpis2["top_product"] = top

    # Recent transactions (last 8 by date)
    recent = (df.sort_values("date", ascending=False).head(8)
              .assign(date=lambda d: d["date"].dt.strftime("%Y-%m-%d"))
              [["transaction_id", "customer_id", "date", "product",
                "quantity", "total_amount"]]
              .to_dict(orient="records"))

    # Basket insights (top association)
    strong_rules = []
    combos = []
    basket_rules = []
    try:
        basket = run_basket_analysis()
        store_rules(basket["rules"])
        basket_rules = basket["rules"]
        strong_rules = sorted(basket["rules"],
                              key=lambda r: r["lift"], reverse=True)[:5]
        combos = generate_combos(n_combos=3)
    except ValueError:
        pass
    except Exception:
        pass

    # Customer activity (orders per month)
    activity = (df.assign(month=df["date"].dt.to_period("M").astype(str))
                .groupby("month")["transaction_id"].nunique()
                .reset_index().rename(columns={"transaction_id": "transactions"})
                .to_dict(orient="records"))

    insights = generate_insights(
        metrics, charts, segments, basket_rules,
        combos[0]["name"] if combos else None,
    )

    return jsonify({
        "has_data": True,
        "kpis": kpis2,
        "sales": metrics,
        "charts": charts,
        "revenue_series": charts["daily"],
        "recent_transactions": recent,
        "strong_rules": [{"id": r["id"], "antecedent_str": r["antecedent_str"],
                          "consequent_str": r["consequent_str"],
                          "lift": r["lift"]} for r in strong_rules],
        "combos": combos,
        "customer_activity": activity,
        "segments": segments,
        "insights": insights,
    })


@app.route("/api/sales")
def api_sales():
    range_key = request.args.get("range", "all")
    start = request.args.get("start")
    end = request.args.get("end")
    df = load_transactions_df()
    period = None
    if not df.empty:
        period = {
            "start": df["date"].min().strftime("%Y-%m-%d"),
            "end": df["date"].max().strftime("%Y-%m-%d"),
        }
    df = _filter_by_range(df, range_key, start, end)
    metrics, charts, _ = compute_sales_analytics(df)
    return jsonify({"metrics": metrics, "charts": charts,
                    "has_data": len(df) > 0, "period": period})


@app.route("/api/basket-analysis", methods=["POST"])
def api_basket_analysis():
    if request.method == "GET":
        return jsonify(run_basket_analysis(0.01, 0.30, 1.0, "apriori"))

    body = request.get_json(silent=True) or {}
    try:
        min_support = float(body.get("min_support", 0.01))
        min_confidence = float(body.get("min_confidence", 0.30))
        min_lift = float(body.get("min_lift", 1.0))
        algorithm = body.get("algorithm", "apriori")
        algorithm = algorithm if algorithm in ("apriori", "fpgrowth") else "apriori"
        result = run_basket_analysis(min_support, min_confidence, min_lift, algorithm)
    except ValueError as e:
        if str(e) == "no_data":
            return jsonify({"has_data": False, "error":
                            "No dataset uploaded yet. Upload a CSV dataset first."}), 400
        if str(e) == "no_rules":
            return jsonify({"has_data": True, "error":
                            "No association rules found with the current settings. "
                            "Try lowering Minimum Support / Confidence or lift."}), 422
        return jsonify({"has_data": True, "error": str(e)}), 400
    except Exception:
        return jsonify({"has_data": True,
                        "error": "Analysis failed. Check the dataset values."}), 500

    store_rules(result["rules"])
    result["has_data"] = True
    result["insights"] = generate_insights(
        None, None, None, result["rules"], None)
    return jsonify(result)


@app.route("/api/recommendations")
def api_recommendations_list():
    df = load_transactions_df()
    if df.empty:
        return jsonify({"has_data": False, "products": []})
    products = sorted(df["product"].unique().tolist())
    return jsonify({"has_data": True, "products": products})


@app.route("/api/recommendations/<path:product>")
def api_recommendations(product):
    try:
        recs = recommend_for_product(product)
    except ValueError as e:
        if str(e) == "no_data":
            return jsonify({"has_data": False,
                            "error": "Upload a dataset before requesting recommendations."}), 400
        return jsonify({"has_data": True, "error": str(e)}), 422
    return jsonify({"has_data": True, "product": product,
                    "recommendations": recs, "count": len(recs)})


@app.route("/api/combos", methods=["GET", "POST"])
def api_combos():
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        min_support = float(body.get("min_support", 0.01))
        min_confidence = float(body.get("min_confidence", 0.30))
        min_lift = float(body.get("min_lift", 1.0))
        algorithm = body.get("algorithm", "apriori")
    else:
        min_support, min_confidence, min_lift, algorithm = 0.01, 0.30, 1.0, "apriori"
    try:
        combos = generate_combos(min_support, min_confidence, min_lift,
                                 algorithm, n_combos=6)
    except ValueError as e:
        if str(e) == "no_data":
            return jsonify({"has_data": False,
                            "error": "Upload a dataset first."}), 400
        return jsonify({"has_data": True, "error": str(e)}), 422
    return jsonify({"has_data": True, "combos": combos,
                    "insight": f"{len(combos)} smart combos were generated "
                               "from real purchase patterns."})


@app.route("/api/customers")
def api_customers():
    df = load_transactions_df()
    if df.empty:
        return jsonify({"has_data": False, "message": "No dataset uploaded yet."})
    kpis, segments, detail = customer_segments(df)
    vc = df.groupby("customer_id")["transaction_id"].count().clip(upper=20)
    orders_chart = vc.value_counts().reset_index()
    orders_chart.columns = ["orders", "count"]
    orders_chart = orders_chart.sort_values("orders")
    orders_chart = orders_chart.to_dict(orient="records")
    return jsonify({"has_data": True, "kpis": kpis, "segments": segments,
                    "detail": detail, "orders_chart": orders_chart})


@app.route("/api/customers/<customer_id>")
def api_customer_detail(customer_id):
    df = load_transactions_df()
    if df.empty:
        return jsonify({"has_data": False})
    rows = df[df["customer_id"] == customer_id]
    if rows.empty:
        return jsonify({"has_data": False, "error": "Customer not found."}), 404
    detail = {
        "customer_id": customer_id,
        "orders": int(rows["transaction_id"].nunique()),
        "total_spend": round(float(rows["total_amount"].sum()), 2),
        "avg_order_value": round(float(rows["total_amount"].mean()), 2),
        "items": int(rows["quantity"].sum()),
        "favorite_category": rows["category"].mode().iloc[0] if not rows.empty else "-",
        "first_order": str(rows["date"].min().date()),
        "last_order": str(rows["date"].max().date()),
        "top_products": rows.groupby("product")["quantity"].sum()
        .sort_values(ascending=False).head(5)
        .reset_index().rename(columns={"quantity": "total_qty"})
        .to_dict(orient="records"),
    }
    return jsonify({"has_data": True, "detail": detail})


@app.route("/api/products")
def api_products():
    df = load_transactions_df()
    if df.empty:
        return jsonify({"has_data": False, "items": [],
                        "total": 0, "categories": []})

    search = request.args.get("search", "").strip().lower()
    category = request.args.get("category", "").strip()
    sort_by = request.args.get("sort", "revenue")
    order = request.args.get("order", "desc")
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(50, max(6, int(request.args.get("per_page", 12))))

    agg = df.groupby("product").agg(
        category=("category", "first"),
        price=("price", "mean"),
        quantity=("quantity", "sum"),
        revenue=("total_amount", "sum"),
        transactions=("transaction_id", "nunique"),
    ).reset_index()

    if search:
        agg = agg[agg["product"].str.lower().str.contains(search, na=False)]
    if category:
        agg = agg[agg["category"] == category]

    sort_col = {"name": "product", "price": "price",
                "quantity": "quantity", "transactions": "transactions"}.get(sort_by, "revenue")
    sort_desc = (order != "asc")
    agg = agg.sort_values(sort_col, ascending=not sort_desc)

    total = len(agg)
    pages = max(1, -(-total // per_page))
    items = agg.iloc[(page - 1) * per_page: page * per_page]
    items["rank"] = range((page - 1) * per_page + 1, (page - 1) * per_page + len(items) + 1)

    return jsonify({
        "has_data": True,
        "items": items.to_dict(orient="records"),
        "categories": sorted(df["category"].unique().tolist()),
        "total": total, "page": page, "pages": pages, "per_page": per_page,
    })


@app.route("/api/products/<path:product>/associations")
def api_product_associations(product):
    df = load_transactions_df()
    if df.empty:
        return jsonify({"has_data": False})
    recs = []
    try:
        recs = recommend_for_product(product, top_n=6)
    except Exception:
        recs = []
    return jsonify({"has_data": True, "product": product,
                    "associations": recs})


@app.route("/api/search")
def api_search():
    q = request.args.get("q", "")
    return jsonify(global_search(q))


@app.route("/api/insights")
def api_insights():
    df = load_transactions_df()
    if df.empty:
        return jsonify({"has_data": False, "insights": []})
    metrics, charts, _ = compute_sales_analytics(df)
    _, segments, _ = customer_segments(df)
    try:
        basket = run_basket_analysis()
        rules = basket["rules"]
    except Exception:
        rules = []
    return jsonify({"has_data": True,
                    "insights": generate_insights(metrics, charts, segments, rules)})


# --------------------------- upload / preview -----------------------
@app.route("/api/upload", methods=["POST"])
def api_upload():
    file = request.files.get("file")
    if file is None or file.filename == "":
        return jsonify({"error": "No file chosen. Please pick a CSV or Excel file."}), 400
    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        return jsonify({"error": "Unsupported file type. Upload a .csv or .xlsx file."}), 400

    safe_name = os.path.basename(file.filename)
    save_path = os.path.join(UPLOAD_DIR, safe_name)
    file.save(save_path)

    try:
        summary, preview = process_and_store(save_path, source=safe_name)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Could not read the file: {e}"}), 400

    return jsonify({"ok": True, "summary": summary, "preview": preview})


@app.route("/api/load-sample", methods=["POST"])
def api_load_sample():
    try:
        summary, preview = process_and_store(SAMPLE_CSV, source="Sample Dataset")
        return jsonify({"ok": True, "summary": summary, "preview": preview})
    except Exception as e:
        return jsonify({"error": f"Could not load sample data: {e}"}), 500


@app.route("/api/dataset-info")
def api_dataset_info():
    df = load_transactions_df()
    if df.empty:
        return jsonify({"has_data": False})
    return jsonify({
        "has_data": True,
        "records": len(df),
        "transactions": int(df["transaction_id"].nunique()),
        "products": int(df["product"].nunique()),
        "customers": int(df["customer_id"].nunique()),
        "category": int(df["category"].nunique()),
        "min_date": str(df["date"].min().date()),
        "max_date": str(df["date"].max().date()),
        "source": df["transaction_id"].iloc[0][0:0] or "loaded",
    })


@app.route("/api/preview")
def api_preview():
    df = load_transactions_df()
    if df.empty:
        return jsonify({"has_data": False})
    records = (df.sort_values("date", ascending=False)
               .assign(date=lambda d: d["date"].dt.strftime("%Y-%m-%d"))
               [["transaction_id", "customer_id", "date", "product",
                 "quantity", "price", "total_amount", "category"]]
               .head(100).to_dict(orient="records"))
    return jsonify({"has_data": True, "records": records})


@app.route("/api/download-sample")
def api_download_sample():
    if not os.path.exists(SAMPLE_CSV):
        return jsonify({"error": "Sample dataset is not available."}), 404
    return send_file(SAMPLE_CSV, as_attachment=True, download_name="sample_retail_data.csv")


@app.route("/api/report")
def api_report():
    return jsonify(build_report_data())


@app.route("/api/download-report")
def api_download_report():
    data = build_report_data()
    text = report_as_text(data)
    buf = io.StringIO(text)
    return send_file(io.BytesIO(buf.read().encode("utf-8")),
                     as_attachment=True,
                     download_name="market_basket_report.txt",
                     mimetype="text/plain")


# ------------------------------------------------------------------
# ERROR HANDLERS
# ------------------------------------------------------------------
@app.errorhandler(404)
def not_found(e):
    return render_template("dashboard.html", page="dashboard",
                           title="Dashboard", app_title=APP_TITLE,
                           not_found=True), 404


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Maximum allowed size is 50 MB."}), 413


@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "An unexpected server error occurred."}), 500


# ------------------------------------------------------------------
# STARTUP / MAIN
# ------------------------------------------------------------------
def on_startup():
    init_db()
    if os.environ.get("SEED_SAMPLE", "").lower() in ("1", "true", "yes"):
        if load_transactions_df().empty and os.path.exists(SAMPLE_CSV):
            process_and_store(SAMPLE_CSV, source="sample")
            print("[startup] Sample dataset seeded for demo.")
    print("[startup] Database ready. Load a dataset from /upload or press "
          "\"Load Sample Data\" on the dashboard.")


on_startup()


if __name__ == "__main__":
    print("=" * 64)
    print(" " + APP_TITLE)
    print("=" * 64)
    port = int(os.environ.get("PORT", 5000))
    host = os.environ.get("HOST", "127.0.0.1")
    debug = os.environ.get("DEBUG", "").lower() in ("1", "true", "yes")
    print(f" Open http://{host}:{port} in your browser.")
    app.run(debug=debug, host=host, port=port)