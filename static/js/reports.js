/* ==========================================================================
   Reports — renders a complete printable report from live analysis data.
   ========================================================================== */
(function () {
  "use strict";
  const $ = window.qs;

  function load() {
    fetch("/api/report").then((r) => r.json()).then((d) => {
      $("#reportArea").innerHTML = renderReport(d);
    }).catch(() => {
      $("#reportArea").innerHTML = `<div class="card"><div class="card-body"><div class="alert alert-error">
        <i class="bi bi-x-octagon-fill"></i><div><strong>Report generation failed.</strong>
        <div class="text-small">Check that the server is running and data is loaded.</div></div></div></div></div>`;
    });
  }

  const SEC = (icon, title, inner) => `
    <div class="report-section">
      <h3><i class="bi ${icon}"></i> ${title}</h3>${inner}
    </div>`;

  function ruleRow(r) {
    return `<tr>
      <td>${r.antecedent.map((a) => esc(a)).join(" + ")}</td>
      <td>→</td>
      <td>${r.consequent.map((c) => esc(c)).join(" + ")}</td>
      <td class="num">${(r.support * 100).toFixed(2)}%</td>
      <td class="num">${(r.confidence * 100).toFixed(1)}%</td>
      <td class="num">${r.lift.toFixed(2)}</td>
    </tr>`;
  }

  function renderReport(d) {
    const S = d.sales;
    const B = d.basket;
    const cust = d.customers;

    if (!d.has_data) {
      return `<div class="report-sheet">
        <div class="empty-state" style="padding:30px">
          <div class="empty-icon">📑</div>
          <h3>Nothing to report yet</h3>
          <p>Upload a retail dataset (or load the sample) and run the analysis — the full report will be generated here automatically.</p>
          <button class="btn btn-primary" onclick="window.location.href='/upload'"><i class="bi bi-cloud-arrow-up"></i> Upload Dataset</button>
        </div>
      </div>`;
    }

    const itemsetTotal = B.itemsets.length;
    const ruleTotal = B.rules.length;

    return `<div class="report-sheet">
      <div class="report-title">${esc(d.app_title)}</div>
      <div class="report-meta">Generated ${d.generated_at} · all metrics calculated from the loaded dataset</div>

      ${SEC("bi-megaphone-fill", "1. Executive Summary", `
        <p class="text-muted text-small mb-2">${(d.insights || []).map((i) => "• " + i).join("<br>")}</p>
        <div class="kv-grid">
          ${[["Transactions", fmt(d.dataset.transactions)], ["Products", fmt(d.dataset.products)], ["Customers", fmt(d.dataset.customers)], ["Rules Generated", fmt(ruleTotal)]].map(([k, v]) =>
            `<div class="kv-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
        </div>`)}
      </div>

      ${SEC("bi-database-fill", "2. Dataset Summary", `
        <div class="table-wrap"><table class="table"><tbody>
          <tr><td>Records (line items)</td><td class="num">${fmt(d.dataset.records)}</td></tr>
          <tr><td>Unique Transactions</td><td class="num">${fmt(d.dataset.transactions)}</td></tr>
          <tr><td>Unique Customers</td><td class="num">${fmt(d.dataset.customers)}</td></tr>
          <tr><td>Unique Products</td><td class="num">${fmt(d.dataset.products)}</td></tr>
          <tr><td>Period</td><td class="num">${esc(d.dataset.period)}</td></tr>
        </tbody></table></div>`)}
      </div>

      ${SEC("bi-graph-up-arrow", "3. Sales Analysis", `
        <div class="kv-grid">
          ${[["Total Revenue", fmtMoney(S.metrics.total_revenue)], ["Total Quantity", fmt(S.metrics.total_quantity) + " units"],
            ["Avg Transaction Value", fmtMoney(S.metrics.avg_transaction_value)], ["Transactions", fmt(S.metrics.num_transactions)],
            ["Top Category", esc((S.charts.categories && S.charts.categories[0]?.category) || "—")],
            ["Top Product", esc((S.charts.top_products && S.charts.top_products[0]?.product) || "—")]].map(([k, v]) =>
              `<div class="kv-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
        </div>
        <h4>Top 5 products by revenue</h4>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Product</th><th class="num">Revenue</th><th class="num">Qty</th></tr></thead>
          <tbody>${(S.charts.top_products || []).slice(0, 5).map((p) =>
            `<tr><td>${esc(p.product)}</td><td class="num">${fmtMoney(p.revenue)}</td><td class="num">${fmt(p.quantity)}</td></tr>`).join("")}
          </tbody></table></div>`)}
      </div>

      ${SEC("bi-layers-fill", `4. Frequent Itemsets (${fmt(itemsetTotal)} found)`, `
        <div class="table-wrap" style="max-height:320px;overflow-y:auto"><table class="table">
          <thead><tr><th class="num">#</th><th>Itemset</th><th class="num">Size</th><th class="num">Support</th><th class="num">Transactions</th></tr></thead>
          <tbody>${(B.itemsets || []).slice(0, 60).map((r, i) =>
            `<tr><td class="num">${i + 1}</td><td>${r.items.map((x) => esc(x)).join(" + ")}</td>
             <td class="num">${r.size}</td><td class="num">${(r.support * 100).toFixed(2)}%</td>
             <td class="num">${fmt(r.transactions)}</td></tr>`).join("")}
          </tbody></table></div>`)}
      </div>

      ${SEC("bi-link-45deg", `5. Association Rules (top ${Math.min(30, ruleTotal)} by lift)`, `
        <div class="table-wrap" style="max-height:340px;overflow-y:auto"><table class="table">
          <thead><tr><th>Antecedent</th><th></th><th>Consequent</th><th class="num">Support</th><th class="num">Confidence</th><th class="num">Lift</th></tr></thead>
          <tbody>${(B.rules || []).sort((a, b) => b.lift - a.lift).slice(0, 30).map(ruleRow).join("") ||
            '<tr><td colspan="6" class="text-muted">No rules found with current thresholds.</td></tr>'}
          </tbody></table></div>`)}
      </div>

      ${SEC("bi-lightbulb-fill", "6. Product Recommendations", `
        ${Object.entries(d.recommendations || {}).slice(0, 6).map(([prod, recs]) => `
          <h4>For “${esc(prod)}”</h4>
          <div class="table-wrap mb-3"><table class="table"><thead><tr><th class="num">#</th><th>Recommended</th>
          <th class="num">Confidence</th><th class="num">Lift</th><th class="num">Support</th></tr></thead>
          <tbody>${(recs || []).map((r, i) =>
            `<tr><td class="num">${i + 1}</td><td>${esc(r.product)}</td>
             <td class="num">${r.confidence_pct}%</td><td class="num">${r.lift}</td>
             <td class="num">${r.support_pct}%</td></tr>`).join("") ||
            '<tr><td colspan="5" class="text-muted">No recommendations available.</td></tr>'}
          </tbody></table></div>`).join("") || '<p class="text-muted text-small">Run the analysis to generate recommendations.</p>'}`)}
      </div>

      ${SEC("bi-gift-fill", "7. Suggested Combo Offers", `
        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
          ${(d.combos || []).map((c) => `
            <div class="combo-card" style="padding:16px">
              <div class="combo-name" style="font-size:14px">${esc(c.name)}</div>
              <div class="combo-products" style="margin:10px 0">${c.products.map((p) => `<span class="combo-product" style="padding:6px 9px;font-size:11.5px">${esc(p)}</span>`).join('<span class="combo-plus">+</span>')}</div>
              <div class="combo-metrics"><div class="combo-metric"><div class="v">${c.confidence}%</div><div class="l">Conf.</div></div>
              <div class="combo-metric"><div class="v">${c.lift}</div><div class="l">Lift</div></div>
              <div class="combo-metric"><div class="v">${c.support}%</div><div class="l">Supp.</div></div></div>
            </div>`).join("") || '<p class="text-muted text-small">No combos generated.</p>'}
        </div>`)}
      </div>

      ${SEC("bi-people-fill", "8. Customer Analysis", `
        <div class="kv-grid">
          ${[["Total Customers", fmt(cust.kpis.total_customers)], ["Active Customers", fmt(cust.kpis.active_customers)],
            ["Avg Purchases/Customer", fmt(cust.kpis.avg_purchases)], ["Avg Spend/Customer", fmtMoney(cust.kpis.avg_spend)]].map(([k, v]) =>
              `<div class="kv-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
        </div>
        <h4>Segment distribution</h4>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Segment</th><th class="num">Customers</th></tr></thead>
          <tbody>${(cust.segments || []).map((s) => `<tr><td>${esc(s.segment)}</td><td class="num">${fmt(s.count)}</td></tr>`).join("")}</tbody>
        </table></div><h4>Top customers by spend</h4>
        <div class="table-wrap"><table class="table"><thead><tr><th>Customer</th><th class="num">Orders</th><th class="num">Total Spend</th></tr></thead>
          <tbody>${(cust.top_customers || []).slice(0, 5).map((c) =>
            `<tr><td>${esc(c.customer_id)}</td><td class="num">${fmt(c.orders)}</td><td class="num">${fmtMoney(c.total_spend)}</td></tr>`).join("")}</tbody>
        </table></div>`)}
      </div>

      ${SEC("bi-stars", "9. Key Findings", `
        <div class="insight-list">${(d.insights || []).map((i) =>
          `<div class="insight-item"><i class="bi bi-lightbulb-fill bulb"></i><span>${esc(i)}</span></div>`).join("")}</div>`)}
      </div>

      <div class="report-meta mt-4" style="text-align:center">
        — End of report · ${esc(d.app_title)} —
      </div>
    </div>`;
  }

  window.printReport = function () { window.print(); };

  load();
})();