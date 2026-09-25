# 🛒 Retail Market Basket Analysis and Product Recommendation System

A full-stack **Flask** web application that discovers products purchased together in retail transactions using **Association Rule Mining (Apriori / FP-Growth)** and turns those hidden patterns into **product recommendations** and **smart combo offers**.

Built as a college (BCA) project — data analytics + machine learning applied to real retail transaction data.

## ✨ Features

| Page | What it does |
| --- | --- |
| **Dashboard** | KPIs, revenue trend, top products, active insights, suggested combos, strong rules, recent transactions, draggable widgets |
| **Upload** | Drag-and-drop CSV / Excel upload, live data cleaning summary, preview table |
| **Sales Analytics** | Revenue / sales trend, top products, category split, payment-on-time style daily/weekly/monthly views, date filter |
| **Market Basket Analysis** | Run Apriori or FP-Growth, tune Support / Confidence / Lift, frequent itemsets, **interactive association network graph**, rules explorer with a "why it matters" sheen |
| **Recommendations** | Pick a product and get ranked recommendations with **Support · Confidence · Lift** and plain-English reasons |
| **Combo Generator** | Auto-suggests promotional combos from item sets, customize products, generate promo message, poster print / PDF / text download |
| **Customers** | Segmentation (High Value / Frequent / Occasional / Low Activity), spend & frequency analysis, drill-down customer drawer |
| **Products** | Explorer with search, category filter, sorting, pagination, "frequently bought with" associations |
| **Reports** | One-click full text report with print / PDF / `.txt` download |

Extra polish: dark/light themes, command palette (Ctrl+K) with global search, toasts, skeletons, presentation mode, and fully offline-capable (Chart.js and Bootstrap Icons vendored locally).

## 🧰 Technologies Used

- **Python 3.14**, **Flask 3.1** (backend, REST APIs)
- **Pandas / NumPy** (data cleaning & analytics)
- **MLxtend** — Apriori & FP-Growth association rule mining
- **SQLite** (zero-config storage) via Flask–SQLite3
- **Chart.js 4** — interactive charts
- **HTML5, CSS3, Vanilla JavaScript** — responsive dashboard UI
- **scikit-learn** — helper utilities
- **openpyxl** — Excel file support

## 🚀 Installation

```bash
# 1. Create and activate a virtual environment (recommended)
python -m venv venv
venv\Scripts\activate        # Windows

# 2. Install dependencies
python -m pip install -r requirements.txt

# 3. Run the app
python app.py
```

Open **http://127.0.0.1:5000** in your browser.

> The app starts **empty** — no data is loaded until you either upload your own file from the **Upload** page or press **Load Sample Data** on the dashboard (loads the bundled generated sample so the demo works instantly). The dataset is regenerated from `data/generate_sample_data.py`, and uploading a new file replaces whatever was loaded.

## 📊 Dataset Format

The uploader accepts CSV, Excel (.xlsx) or .txt files with these columns (aliases are auto-mapped, e.g. `TransactionID` → `transaction_id`):

| Column | Required | Description |
| --- | --- | --- |
| `transaction_id` | ✅ | Unique bill/invoice number (OrderID / BillNo / InvoiceNo) |
| `customer_id` | ✅ | Customer or member ID |
| `date` | ✅ | Date / datetime of the purchase |
| `product` | ✅ | Product name |
| `quantity` | optional | Units purchased (defaults to 1) |
| `price` | optional | Unit price (defaults to 0) |
| `category` | optional | Product category (fills "Other") |

Preprocessing is automatic: column aliases, invalid-row removal, date coercion, product name cleaning, deduplication, and `total_amount = quantity × price`.

## 🔍 Methodology

The system mines **association rules** of the form **Antecedent → Consequent** ("customers who buy *Bread* also buy *Butter*") and rates every rule with three measures:

- **Support** — how often the itemset appears in all transactions.
  `Support(A→B) = count(A∪B) / total transactions`
- **Confidence** — how often customers who buy the antecedent also buy the consequent.
  `Confidence(A→B) = Support(A∪B) / Support(A)`
- **Lift** — how much stronger the association is than random chance.
  `Lift(A→B) = Confidence(A→B) / Support(B)`
  Lift **> 1** = genuine positive association · **= 1** = independent · **< 1** = negative association.

Two algorithms are supported, both from MLxtend:

1. **Apriori** — breadth-first candidate generation with downward-closure pruning.
2. **FP-Growth** — FP-tree based mining without candidate generation (generally faster).

## 📸 Screenshots

*(Add your screenshots to a `screenshots/` folder and reference them here, e.g. `![Dashboard](screenshots/dashboard.png)`.)*

## 🧪 Testing

The backend ships with a self-check you can run after seeding data:

```bash
python -c "import app; c = app.app.test_client(); print(c.get('/api/dashboard').status_code)"
```

## 🔮 Future Enhancements

- A/B testing & seasonal discount optimization for combos
- Recommendation personalization by customer segment
- Streaming ingestion for live retail POS feeds
- Deployment to a cloud platform (Render / Railway / Docker)

## 🚀 Deploy on Render

This copy (`retail-market-basket-render`) is configured for [Render](https://render.com):

- **`Procfile`** — starts the app with `gunicorn` (single worker, SQLite-safe).
- **`render.yaml`** — one-click deploy blueprint. Pip installs deps, mounts a **1 GB persistent disk** at `/var/data` (DB + uploads survive restarts), and sets `SEED_SAMPLE=true` so the sample dataset loads automatically on first boot.
- **`app.py`** reads `PORT` / `HOST` / `DEBUG`, and `DATA_DIR` for the database location.

**Deploy via blueprint (simplest):**
1. Push this folder to a GitHub repo.
2. In Render → **New → Blueprint**, connect the repo.
3. Render reads `render.yaml` and creates the web service (free plan OK), then opens `https://<service>.onrender.com`.

**Deploy as a regular Web Service:**
1. Push to GitHub.
2. Render → **New → Web Service** → connect repo.
3. Settings: Runtime **Python** · Build `pip install -r requirements.txt` · Start `gunicorn --workers 1 --threads 4 --timeout 180 app:app` · instance type **Free**.
4. Environment variables: `DATA_DIR=/var/data`, `SEED_SAMPLE=true`, and a **Persistent Disk** of 1 GB mounted at `/var/data`.
5. Deploy and open the generated URL.

> The provided `SEED_SAMPLE` flag is *demo-only* — the main `retail-market-basket` project deliberately starts empty (no auto-seed).

## 📄 Documentation

See [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md) for the full college project report (analysis, design, algorithms, testing and results).

---

*Made with ❤️ as a college project — data analytics · machine learning · full-stack web development.*