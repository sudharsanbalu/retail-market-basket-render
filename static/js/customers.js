/* ==========================================================================
   Customer Analysis — KPIs, segment/spend charts, customer cards + drawer.
   ========================================================================== */
(function () {
  "use strict";
  const $ = window.qs, $$ = window.qsa;

  const KPI_DEFS = [
    { key: "total_customers", label: "Total Customers", icon: "bi-people", tone: "t-blue" },
    { key: "active_customers", label: "Active Customers", icon: "bi-person-check", tone: "t-green", note: "≥ 2 orders" },
    { key: "avg_purchases", label: "Avg. Purchases / Customer", icon: "bi-cart-check", tone: "t-amber" },
    { key: "avg_spend", label: "Avg. Spend / Customer", icon: "bi-wallet2", tone: "t-rose", money: true },
  ];
  const SEG_COLORS = { "High Value": "#ea580c", "Frequent": "#f59e0b", "Occasional": "#eab308", "Low Activity": "#f43f5e" };
  const SEG_ICONS = { "High Value": "bi-trophy-fill", "Frequent": "bi-lightning-charge-fill", "Occasional": "bi-person-walking", "Low Activity": "bi-dash-circle" };

  function load() {
    fetch("/api/customers").then((r) => r.json()).then((d) => {
      if (!d.has_data) {
        $("#custEmpty").style.display = "block";
        $("#custBody").style.display = "none";
        $("#custKpis").innerHTML = "";
        return;
      }
      $("#custEmpty").style.display = "none";
      $("#custBody").style.display = "block";
      renderKpis(d.kpis);
      renderCharts(d);
      renderCustomers(d.detail.customers, d.kpis);
      $("#custCount").textContent = `${d.kpis.total_customers} customers`;
    }).catch(() => toast("error", "Customers", "Failed to load customer analysis."));
  }

  function renderKpis(k) {
    $("#custKpis").innerHTML = KPI_DEFS.map((d) => `
      <div class="kpi-card fade-up">
        <div class="kpi-top"><div class="kpi-icon ${d.tone}"><i class="bi ${d.icon}"></i></div></div>
        <div class="kpi-label">${d.label}</div>
        <div class="kpi-value">${d.money ? fmtMoney(k[d.key]) : fmt(k[d.key])}</div>
        <div class="sub">${d.note || "from your dataset"}</div>
      </div>`).join("");
  }

  function renderCharts(d) {
    // segments doughnut
    const segs = d.segments || [];
    createDoughnut("segmentChart",
      segs.map((s) => s.segment),
      segs.map((s) => s.count),
      { unit: "cust" });
    // spending distribution
    const dist = d.detail.distribution || [];
    createBar("spendDistChart", dist.map((x) => x.range), dist.map((x) => x.count), {
      label: "Customers", colors: Array(dist.length).fill("#ea580c"), maxBarThickness: 30,
    });
    // purchase frequency
    const orders = d.orders_chart || [];
    createLine("ordersChart", orders.map((x) => x.orders), orders.map((x) => x.count), {
      label: "Customers",
      options: { plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: themeCss("--muted") } } } },
    });
    // top customers bar
    const top = (d.detail.top_customers || []).slice(0, 8).reverse();
    createHBar("topCustChart", top.map((c) => c.customer_id), top.map((c) => Math.round(c.total_spend)), {
      label: "Spend", colors: ["#f59e0b"],
    });
  }

  function renderCustomers(customers, kpis) {
    const segSummary = (kpis.total_customers || 1);
    const list = [...customers].sort((a, b) => b.total_spend - a.total_spend);
    $("#customerCards").innerHTML = list.map((c, i) => `
      <div class="customer-card fade-up" style="animation-delay:${Math.min(i, 12) * 40}ms" onclick="window.openCustomer('${esc(c.customer_id)}')" role="button" tabindex="0">
        <div class="d-flex align-center gap-2 mb-2">
          <div class="customer-avatar">${esc(String(c.customer_id).replace("C", "").slice(-2))}</div>
          <div>
            <div class="fw-700">${esc(c.customer_id)}</div>
            <div class="text-muted text-small"><span class="badge badge-${c.segment === "High Value" ? "primary" : c.segment === "Frequent" ? "accent" : c.segment === "Occasional" ? "warning" : "muted"}" style="padding:2px 8px">
              <i class="bi ${SEG_ICONS[c.segment] || "bi-person"}"></i> ${c.segment}</span></div>
          </div>
        </div>
        <div class="d-flex justify-between mt-1">
          <div><div class="fw-700" style="color:var(--success)">${fmtMoney(c.total_spend)}</div><div class="text-small text-muted">spent</div></div>
          <div><div class="fw-700">${fmt(c.orders)}</div><div class="text-small text-muted">orders</div></div>
          <div><div class="fw-700">${fmt(c.avg_basket)}</div><div class="text-small text-muted">avg basket</div></div>
        </div>
      </div>`).join("") || '<div class="text-muted text-small">No customers found.</div>';
  }

  window.openCustomer = function (id) {
    fetch(`/api/customers/${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => {
      if (!d.has_data) { toast("warning", "Customer", "Customer not found."); return; }
      const c = d.detail;
      openDrawer(`Customer Overview · ${esc(c.customer_id)}`,
        `<div class="d-flex align-center gap-2 mb-3">
          <div class="customer-avatar">${esc(String(c.customer_id).replace("C", "").slice(-2))}</div>
          <div><div class="fw-700" style="font-size:17px">${esc(c.customer_id)}</div>
          <div class="text-muted text-small">Active since ${c.first_order}</div></div>
        </div>
        <div class="kv-grid" style="grid-template-columns:repeat(2,1fr)">
          ${[["Total Orders", fmt(c.orders)], ["Total Spending", fmtMoney(c.total_spend)],
            ["Avg Order Value", fmtMoney(c.avg_order_value)], ["Items Bought", fmt(c.items)],
            ["Favorite Category", esc(c.favorite_category)], ["Last Order", esc(c.last_order)]].map(([k, v]) =>
              `<div class="kv-item"><div class="k">${k}</div><div class="v" style="font-size:14px">${v}</div></div>`).join("")}
        </div>
        <h4 class="fw-700 mt-3 mb-2" style="font-size:14px">Frequently purchased products</h4>
        ${(c.top_products || []).map((p, i) =>
          `<div class="d-flex align-center justify-between" style="padding:9px 2px;border-bottom:1px dashed var(--border)">
            <div class="d-flex align-center gap-2"><span class="badge badge-primary">${i + 1}</span>
            <strong>${emojiFor(p.product)} ${esc(p.product)}</strong></div>
            <span class="badge badge-flat">${fmt(p.total_qty)} units</span></div>`).join("") ||
          '<div class="text-muted text-small">No products recorded.</div>'}`,
        `<button class="btn btn-outline btn-sm" onclick="window.location.href='/recommendations?product=${encodeURIComponent(c.top_products[0] ? c.top_products[0].product : "")}'">
          <i class="bi bi-lightbulb"></i> Recommend for this customer's favorite</button>`);
    });
  };

  window.whatIsSegment = function () {
    openModal(`
      <div class="modal-header"><h3><i class="bi bi-pie-chart-fill text-primary"></i> Segmentation Rules</h3>
        <button class="icon-btn" onclick="closeModal()"><i class="bi bi-x-lg"></i></button></div>
      <div class="modal-body">
        <p class="text-muted mb-3 text-small">Segments are assigned using simple, explainable rules computed from your dataset — no hidden assumptions:</p>
        ${[["High Value", "Total spend >= the 75th percentile of spend across all customers.", "#ea580c"],
           ["Frequent", "Not High Value, but order count >= the 75th percentile of orders.", "#f59e0b"],
           ["Occasional", "Not in the above groups, with at least 2 orders.", "#eab308"],
           ["Low Activity", "Only a single recorded order.", "#f43f5e"]].map(([name, desc, color]) =>
          `<div style="display:flex;gap:12px;margin-bottom:14px;align-items:flex-start">
             <span class="badge" style="background:${color}22;color:${color};border:1px solid ${color}55">${name}</span>
             <span class="text-small text-muted">${desc}</span></div>`).join("")}
      </div>`);
  };

  load();
})();