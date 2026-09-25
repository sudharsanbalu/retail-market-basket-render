# PROJECT REPORT

## Retail Market Basket Analysis and Product Recommendation System

---

| | |
| --- | --- |
| **Course** | Bachelor of Computer Applications (BCA) |
| **Language / Platform** | Python · Flask · SQLite |
| **Category** | Data Analytics · Machine Learning (Association Rule Mining) |

---

## 1. Abstract

Market basket analysis is a powerful retail technique that identifies products customers tend to purchase together. This project presents a complete web-based system that ingests retail transaction data, cleans it automatically, and mines frequent itemsets and **association rules** using the **Apriori** and **FP-Growth** algorithms. The discovered rules are ranked with **Support, Confidence and Lift** and then converted into two business-facing outputs: **product recommendations** ("customers who bought X also bought Y") and **smart combo offers** ("buy items A, B and C together at a special price").

The application is built as a responsive single-window dashboard with interactive charts (Chart.js), an interactive association-network graph, customer segmentation, and one-click report generation. It runs fully offline, auto-seeds a realistic sample dataset on first launch, and allows users to upload their own data in CSV, Excel or text format.

## 2. Introduction

Retailers collect millions of transactions but often fail to extract the hidden buying patterns buried inside them. **Association rule mining** addresses exactly this: it scans every purchase basket and systematically finds items that co-occur more often than chance.

This project implements that idea as an end-to-end analytics product:

1. **Input layer** — upload a retail dataset (CSV / Excel / TXT) or use the bundled sample data.
2. **Processing layer** — pandas-based preprocessing, transaction basket building, and Apriori / FP-Growth mining.
3. **Output layer** — a dashboard featuring sales analytics, frequent itemsets, association rules, product recommendations, combo offers, customer segmentation and printable reports.

## 3. Problem Statement

- Store managers can *see* what sells, but not *why* products sell together.
- Manual analysis of thousands of transactions is time-consuming and error-prone.
- Generic "customers also bought" widgets are static and not backed by statistical measures.
- Small and medium retail businesses lack affordable, zero-configure analytics tools.

## 4. Objectives

- Preprocess raw retail transaction data automatically (aliases, missing values, invalid rows, data types).
- Mine frequent itemsets and association rules using Apriori and FP-Growth.
- Rank rules using Support, Confidence and Lift, filtering only genuine associations (Lift ≥ 1).
- Generate ranked product recommendations for any product with human-readable explanations.
- Generate promotional combo offers derived from mined item sets.
- Segment customers into actionable groups (High Value, Frequent, Occasional, Low Activity).
- Produce a complete auto-generated text report with print / PDF support.

## 5. Existing System

- Excel pivot tables — laborious, static, no statistical validity.
- Opinion-based cross-selling ("managers guess") — accurate but not scalable.
- Readymade BI tools (Tableau, Power BI) — expensive, heavy, overkill for small retailers, and require data-warehouse setups.

## 6. Proposed System

- A lightweight **Flask** web app that runs on any Windows PC with a double-click.
- SQLite persistence — no database server required.
- One-click data upload → automatic cleaning → analysis → recommendations → report.
- Statistical rigour behind every recommendation (Support / Confidence / Lift).
- Fully offline: Chart.js and icon fonts vendored locally.

## 7. Scope

- Applicable to any retail domain: grocery, fashion, pharmacy, electronics.
- Handles datasets with up to tens of thousands of transactions comfortably.
- Two mining algorithms (Apriori and FP-Growth) with user-tunable thresholds.
- Extensible: output modules (recommendations, combos, customers, reports) are decoupled plug-in style.

## 8. Requirements

### 8.1 Functional Requirements

- Upload datasets in CSV, XLSX or TXT format with drag & drop and progress indication.
- Auto-map common column aliases; show a cleaning summary.
- Run basket analysis with selectable algorithm and Support / Confidence / Lift thresholds.
- Display frequent itemsets and association rules in sortable, searchable tables.
- Visualise rules as an interactive network graph.
- Recommend products for any selected product with reasons.
- Generate, customize and export combo offers (poster print / PDF / text).
- Segment customers and drill into individual customer history.
- Explore products with associations.
- Generate a full text report and download / print it.

### 8.2 Non-Functional Requirements

- **Usability** — no technical knowledge required; clear empty states and toasts.
- **Performance** — analysis of the sample dataset completes in < 2 s.
- **Reliability** — graceful error handling for bad uploads, no-data and no-rules cases.
- **Portability** — runs on Windows / Linux / macOS with Python 3.10+.
- **Offline capability** — no external CDN at runtime.

### 8.3 Hardware Requirements

| Resource | Minimum |
| --- | --- |
| Processor | Any dual-core, 1.6 GHz+ |
| RAM | 4 GB (8 GB recommended) |
| Disk | 500 MB free |
| Display | 1024×768 or higher |

### 8.4 Software Requirements

- Windows 10/11 (or Linux/macOS)
- Python 3.10+ (developed on 3.14)
- Flask 3.x, pandas, numpy, mlxtend, scikit-learn, openpyxl (see `requirements.txt`)

## 9. System Architecture

```
              ┌──────────────────────────────────────────────┐
  USER  ───▶  │                 FLASK WEB APP                 │
              │                                              │
              │   ┌───────────────┐    ┌──────────────────┐   │
              │   │   Presentation │    │    Business      │   │
CSV/XLSX ──▶  │   │   (Jinja2 +    │    │     Logic:       │   │
              │   │    Vanilla JS) │◀──▶│  - preprocess_df │   │
              │   └───────────────┘    │  - build_baskets  │   │
              │                        │  - run analysis   │   │
              │                        │  - recommendations│   │
              │                        │  - combos         │   │
              │                        │  - segmentation   │   │
              │                        │  - report builder │   │
              │                        └────────┬─────────┘   │
              └──────────────────────────────────┬────────────┘
                                                 │
                              ┌──────────────────┴──────────────┐
                              │  SQLite (transactions, products,│
                              │  customers, association_rules)  │
                              └─────────────────────────────────┘
```

## 10. Data Flow Diagram — Level 0 (Context)

```
              ┌───────────────────────────┐
   Data ───▶  │   Market Basket Analysis   │ ───▶  Rules / Recs / Combos
              │           System          │ ───▶  Report / Print
              └───────────────────────────┘
```

## 11. Data Flow Diagram — Level 1

```
 User Upload ──▶ [0.1 Validate & Clean] ──▶ Clean Transactions
                                              │
 Clean Transactions ──▶ [0.2 Build Baskets] ──▶ Baskets (user × products)
                                                    │
 Baskets ──▶ [0.3 Mine Rules (Apriori/FP)] ──▶ Itemsets + Rules
                                                    │
          ┌──────────────────┬─────────────────────┼──────────────┐
          ▼                  ▼                     ▼              ▼
   [0.4 Recommend]   [0.5 Combos]           [0.6 Segments]  [0.7 Report]
   ranked products   promo offers           customer        full text
   + reasons         + poster download      groups          + print
```

## 12. ER Diagram

- **Customer** (customer_id, name) — 1 ── N **Purchase**
- **Product** (product_id, name, category, price) — 1 ── N **Sale line**
- **Transaction** (transaction_id, customer_id, date) — 1 ── N **Sale line**
- **Sale line** (transaction_id, product_id, quantity, amount)
- **Association Rule** (antecedent, consequent, support, confidence, lift) *(derived store)*

```
      ┌──────────┐ 1        N ┌───────────┐ N        N ┌─────────┐
      │ Customer ├────────────│  Order    │────────────│ Product │
      └──────────┘            └───────────┘            └─────────┘
                                               ▲ derived ▲
                        ┌──────────────┐
                        │ Rule (A→B)   │   support, confidence, lift
                        └──────────────┘
```

## 13. Modules

1. **Dashboard** — KPI cards, revenue trends, top products, live insights, suggested combos, strong rules, recent transactions, draggable widgets.
2. **Data Upload & Preprocessing** — drag-drop, XHR progress bar, cleaning summary, preview parser.
3. **Sales Analytics** — daily/weekly/monthly revenue, top products, categories, KPIs, date filters.
4. **Basket Analysis** — algorithm selection, threshold sliders, progress-walk simulation, frequent itemsets, rules explorer, interactive network graph.
5. **Recommendations** — product chooser, ranked recommendations with confidence metres and plain-English reasons.
6. **Combo Generator** — item-set-driven combos, customisation, auto promo message, poster print/PDF/text.
7. **Customer Analytics** — RFM-style segmentation, spend/frequency charts, customer drill-down drawer.
8. **Product Explorer** — search/filter/sort/paginate, per-product associations.
9. **Reporting** — one-click full report with print / PDF / `.txt` download.
10. **About** — methodology, terms (Support/Confidence/Lift), technologies.

## 14. Algorithms

### 14.1 Apriori

- Generates candidate itemsets of size *k* from frequent itemsets of size *k−1*.
- Prunes via the **downward-closure property**: an itemset can be frequent only if all its subsets are frequent.
- Requires a full database scan per level → simple, robust, but slower on dense data.

### 14.2 FP-Growth

- Compresses transactions into an **FP-tree** where shared prefixes are merged.
- Mines frequent itemsets directly from the tree via conditional pattern bases — **no candidate generation**.
- Generally faster than Apriori on medium/large datasets.

### 14.3 Association Rule Measures

| Measure | Formula | Meaning |
| --- | --- | --- |
| Support(A→B) | `count(A∪B) / total transactions` | frequency of the combination |
| Confidence(A→B) | `Support(A∪B) / Support(A)` | P(B given A) |
| Lift(A→B) | `Confidence(A→B) / Support(B)` | strength vs. random chance |

**Interpretation:** Lift > 1 → positive association; Lift = 1 → independent; Lift < 1 → negative. Only Lift ≥ 1 rules surface in the UI.

## 15. Implementation Details

- **Backend** (`app.py`): Flask routes + SQLite3 (query API) + pandas (in-memory analytics).
- **Mining**: `mlxtend.frequent_patterns.apriori` / `fpgrowth` + `association_rules`.
- **Baskets**: one-hot matrix per transaction, boolean dtype (avoids MLxtend deprecation warnings).
- **Storage**: cleaned transactions, product & customer master, and the mined rules are persisted in SQLite so recommendations/combos reuse the same rules.
- **Recommendation scoring**: favours clean single-product rules (`A → B`), adds a single-item bonus, and confirms lift-filtering to reject noise.
- **Customer segmentation**: quantile-driven — High Value (spend ≥ 75th pct), Frequent (orders ≥ 75th pct), Occasional (≥ 2 orders), Low Activity (1 order).
- **Frontend**: base layout with sidebar + topbar, theme switching (CSS variables), command palette (Ctrl+K) wired to live search API, skeletons, toasts, modals/drawers, and a presentation mode.
- **Charts**: Chart.js v4 vendored locally; all charts theme-aware and destroyed/recreated safely via a canvas registry.

## 16. Testing

### 16.1 Backend tests (Python test client)

| Test | Result |
| --- | --- |
| Load sample dataset (1492 records, 424 transactions, 24 products, 37 customers) | ✅ |
| `/api/dashboard` returns KPIs + charts | ✅ 200 |
| Preprocessing: aliases, missing values, invalid dates/amounts, dedupe | ✅ |
| Apriori run → 159 itemsets, 211 rules (default thresholds) | ✅ |
| FP-Growth run → identical rule count | ✅ |
| Strict thresholds (0.5 / 0.9 / 3.0) → clean 422 "no rules" message | ✅ |
| `/api/recommendations/Bread` → 6 ranked recommendations | ✅ |
| `/api/combos` → 6 suggested combos with real metrics | ✅ |
| Customer segmentation + top-customer detail | ✅ |
| `/api/report` → 4.9 KB formatted text | ✅ |
| Upload sample CSV → cleaned 1492 records | ✅ 200 |
| Upload garbage file (no required columns) → friendly 400 message | ✅ |
| `/api/search?q=milk` global search | ✅ |

### 16.2 Frontend tests

- All 11 JS modules pass `node --check` (no syntax errors).
- Every page (dashboard, upload, analytics, basket-analysis, recommendations, combos, customers, products, reports, about) renders HTTP 200.
- Vendored Chart.js (205 KB) and CSS serve correctly; no external CDN at runtime.

### 16.3 Sample results (bundled retail dataset)

| Rule | Support | Confidence | Lift |
| --- | --- | --- | --- |
| Butter → Bread | 30.9% | 85.6% | 2.31 |
| Bread → Butter | 30.9% | 83.4% | 2.31 |
| Milk → Coffee | ~24% | ~66% | 3.98 |

Suggested combos include a **Breakfast Combo** (Bread, Butter, Eggs, Milk) and a **Kitchen Staples Combo** (Cooking Oil, Dal, Rice, Salt), each scored with Support/Confidence/Lift.

## 17. Results

- The system successfully mines genuine buying patterns and filters noise using Lift.
- Recommendations carry statistical justification, not guesses.
- Exportable deliverables: combo posters, full text reports, printable pages.

## 18. Advantages

- Zero configuration — SQLite + vendored assets make it fully offline-ready.
- Automatic data cleaning handles messy real-world retail exports.
- Plain-language insights make results understandable to non-technical staff.
- Cheap and scalable for small-to-medium brick-and-mortar retailers.

## 19. Limitations

- Association strength depends on data volume; sparse datasets yield few rules.
- Rules reflect correlation, not causation.
- Very large datasets benefit from FP-Growth but extreme sizes still need memory tuning.

## 20. Future Enhancements

- A/B tests and season-aware pricing for combo offers.
- Segment-personalised recommendations.
- Live POS streaming and automatic daily rule refresh.
- Export to Excel/PDF with charts.
- Deployment to the cloud (Docker + Render/Railway).

## 21. Conclusion

The Retail Market Basket Analysis and Product Recommendation System demonstrates a complete, production-shaped analytics pipeline — from raw transaction upload to statistically grounded recommendations and promotional combos. By combining the Apriori and FP-Growth algorithms with the three canonical rule measures (Support, Confidence, Lift), the project moves retail insights from guesswork to evidence, and wraps it in a polished, offline-capable web dashboard ideal for a college-level demonstration.

## 22. References

1. Agrawal, R. & Srikant, R. — *Fast Algorithms for Mining Association Rules* (VLDB 1994) — Apriori.
2. Han, J., Pei, J. & Yin, Y. — *Mining Frequent Patterns without Candidate Generation* (SIGMOD 2000) — FP-Growth.
3. MLxtend documentation — `frequent_patterns.apriori`, `fpgrowth`, `association_rules`.
4. Flask Official Documentation — https://flask.palletsprojects.com
5. Chart.js Documentation — https://www.chartjs.org
6. Pandas — https://pandas.pydata.org