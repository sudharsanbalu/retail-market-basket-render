/* ==========================================================================
   Dashboard page — KPI animations, interactive charts, draggable widgets,
   widget visibility controls (persisted in localStorage), insights.
   ========================================================================== */
(function () {
  "use strict";

  const $ = window.qs, $$ = window.qsa;

  const KPI_META = [
    { key: "total_transactions", label: "Total Transactions", icon: "bi-cart3", tone: "", tooltip: "Unique transaction IDs in the dataset", prefix: "" },
    { key: "total_customers", label: "Total Customers", icon: "bi-people", tone: "t-blue", tooltip: "Distinct customers in the dataset", prefix: "" },
    { key: "total_products", label: "Total Products", icon: "bi-box-seam", tone: "t-cyan", tooltip: "Distinct products sold", prefix: "" },
    { key: "total_revenue", label: "Total Revenue", icon: "bi-currency-rupee", tone: "t-green", tooltip: "Sum of all transaction amounts", prefix: "₹" },
    { key: "avg_order_value", label: "Avg. Order Value", icon: "bi-cash-stack", tone: "t-amber", tooltip: "Revenue ÷ transactions", prefix: "₹" },
    { key: "top_product", label: "Top Product", icon: "bi-trophy", tone: "t-rose", tooltip: "Product with the highest revenue", prefix: "" },
  ];

  let state = { data: null, revMode: "daily", topMode: "revenue" };
  let charts = {};

  const WIDGET_ORDER_KEY = "dash-widget-order";
  const WIDGET_HIDDEN_KEY = "dash-widget-hidden";

  /* ---------------- data loading ---------------- */
  function load() {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((data) => {
        if (!data.has_data) {
          showEmpty();
          return;
        }
        state.data = data;
        $("#quickActionsCard").style.display = "block";
        $("#runAnalysisBtn").style.display = "";
        renderKPIs(data.kpis);
        renderCharts(data);
        renderStrongRules(data.strong_rules);
        renderCombos(data.combos);
        renderInsights(data.insights);
        renderRecent(data.recent_transactions);
        applyWidgetPrefs();
        bindWidgets(data);
      })
      .catch(() => {
        showEmpty();
        toast("error", "Dashboard", "Could not load dashboard data.");
      });
  }

  function showEmpty() {
    $("#kpiArea").innerHTML = "";
    $("#dashEmpty").style.display = "block";
    $("#runAnalysisBtn").style.display = "none";
    $("#quickActionsCard").style.display = "none";
    $("#widgetGrid").style.display = "none";
  }

  /* ---------------- KPI cards ---------------- */
  function renderKPIs(kpis) {
    $("#kpiArea").innerHTML = KPI_META.map((m) => {
      const val = kpis[m.key];
      const isMoney = m.prefix === "₹";
      const display = m.key === "top_product"
        ? (val ? `<div class="kpi-value" style="font-size:19px">${esc(val)}</div>` : '<div class="kpi-value" style="font-size:19px">—</div>')
        : `<div class="kpi-value" data-anim="true" data-target="${Number(val) || 0}" data-money="${isMoney}">0</div>`;
      return `<div class="kpi-card" role="button" tabindex="0" title="${m.tooltip}">
        <div class="kpi-top">
          <div class="kpi-icon ${m.tone}"><i class="bi ${m.icon}"></i></div>
          <span class="badge badge-flat"><i class="bi bi-info-circle"></i></span>
        </div>
        <div class="kpi-label">${m.label}</div>
        ${display}
        <div class="sub">${m.key === "top_product" ? "by revenue" : "computed from your dataset"}</div>
      </div>`;
    }).join("");

    // Animate numbers from 0
    $$("[data-anim]").forEach((el) => {
      const target = parseFloat(el.dataset.target);
      const money = el.dataset.money === "true";
      animateNumber(el, target, money);
    });
  }

  function animateNumber(el, target, money) {
    const dur = 1100, start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      const v = target * ease;
      el.textContent = money ? fmtMoney(v) : fmt(Math.round(v));
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = money ? fmtMoney(target) : fmt(target);
    }
    requestAnimationFrame(tick);
  }

  /* ---------------- charts ---------------- */
  function renderCharts(data) {
    renderRevenueChart();
    renderTopProductsChart();
    renderCategoriesChart(data.charts.categories);
    renderActivityChart(data.customer_activity);
  }

  function renderRevenueChart() {
    const all = state.data.revenue_series || [];
    if (!all.length) { setSkeleton("revChart"); return; }

    let labels, values, label = "Daily revenue";
    if (state.revMode === "weekly") {
      const agg = {};
      all.forEach((d) => {
        const key = weekKey(d.date);
        agg[key] = (agg[key] || 0) + d.revenue;
      });
      labels = Object.keys(agg); values = Object.values(agg); label = "Weekly revenue";
    } else if (state.revMode === "monthly") {
      const agg = {};
      all.forEach((d) => {
        const key = d.date.slice(0, 7);
        agg[key] = (agg[key] || 0) + d.revenue;
      });
      labels = Object.keys(agg); values = Object.values(agg); label = "Monthly revenue";
    } else {
      labels = all.map((d) => d.date);
      values = all.map((d) => d.revenue);
    }
    hideSkeleton("revChart");
    charts.rev = createLine("revChart", labels, values, {
      label, options: { scales: { y: { grid: { color: themeCss("--border") }, ticks: { color: themeCss("--muted") } }, x: { grid: { display: false }, ticks: { color: themeCss("--muted") } } },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${label}: ${fmtMoney(c.parsed.y)}` } } } },
    });
  }

  function weekKey(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    const day = (d.getDay() + 6) % 7; // Mon = 0
    d.setDate(d.getDate() - day + 3);
    const first = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - first) / 86400000 + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  function renderTopProductsChart() {
    const top = (state.data.charts.top_products || []).slice(0, 8);
    if (!top.length) { setSkeleton("topProdsChart"); return; }
    const mode = state.topMode;
    const labels = top.map((p) => p.product);
    const values = top.map((p) => p[mode]);
    hideSkeleton("topProdsChart");
    charts.tops = createHBar("topProdsChart", labels.reverse(), values.reverse(), {
      label: mode, colors: chartPalette(labels.length),
    });
  }

  function renderCategoriesChart(cats) {
    if (!cats || !cats.length) { setSkeleton("catChart"); return; }
    hideSkeleton("catChart");
    const labels = cats.map((c) => c.category);
    const values = cats.map((c) => c.revenue);
    charts.cat = createDoughnut("catChart", labels, values, { unit: "" , onClick: (evt, els) => {
      if (els.length) window.location.href = `/products?category=${encodeURIComponent(labels[els[0].index])}`;
    }});
  }

  function renderActivityChart(activity) {
    if (!activity || !activity.length) { setSkeleton("activityChart"); return; }
    hideSkeleton("activityChart");
    charts.act = createLine("activityChart", activity.map((a) => a.month), activity.map((a) => a.transactions), {
      label: "Transactions",
      options: { plugins: { legend: { display: false } } },
    });
  }

  function skeletonFor(id) {
    const box = document.getElementById(id).closest(".chart-box");
    return box ? box.querySelector(".chart-skeleton") : null;
  }
  function setSkeleton(id) {
    const s = skeletonFor(id); if (s) s.style.display = "block";
    document.getElementById(id).style.display = "none";
  }
  function hideSkeleton(id) {
    const s = skeletonFor(id); if (s) s.style.display = "none";
    document.getElementById(id).style.display = "block";
  }

  /* ---------------- lists ---------------- */
  function renderStrongRules(rules) {
    const el = $("#strongRulesList");
    if (!rules || !rules.length) { el.innerHTML = emptySmall("No association rules yet — run the analysis."); return; }
    el.innerHTML = rules.map((r, i) => `
      <div class="d-flex align-center justify-between" style="padding:10px 4px;border-bottom:1px dashed var(--border)">
        <div class="d-flex align-center gap-2 wrap">
          <span class="badge badge-primary">#${i + 1}</span>
          <strong>${emojiFor(firstLabel(r.antecedent_str))} ${esc(r.antecedent_str)}</strong>
          <span class="text-primary"><i class="bi bi-arrow-right"></i></span>
          <strong>${emojiFor(firstLabel(r.consequent_str))} ${esc(r.consequent_str)}</strong>
        </div>
        <span class="badge badge-accent"><i class="bi bi-activity"></i> Lift ${(r.lift).toFixed(2)}</span>
      </div>`).join("");
  }

  function renderCombos(combos) {
    const el = $("#comboPreview");
    if (!combos || !combos.length) { el.innerHTML = emptySmall("Generate combos to see suggestions."); return; }
    el.innerHTML = combos.slice(0, 2).map((c) => `
      <div class="combo-metrics mb-2" style="margin-bottom:10px">
        <div class="combo-metric"><div class="v">${c.confidence}%</div><div class="l">Confidence</div></div>
        <div class="combo-metric"><div class="v">${c.lift}</div><div class="l">Lift</div></div>
        <div class="combo-metric"><div class="v">${c.support}%</div><div class="l">Support</div></div>
      </div>
      <div class="combo-products" style="margin-bottom:6px">
        ${c.products.map((p, i) => `${i ? '<span class="combo-plus">+</span>' : ""}<span class="combo-product" style="padding:6px 10px">${emojiFor(p)} ${esc(p)}</span>`).join("")}
      </div>
      <div class="text-center text-small text-muted">${esc(c.name)}</div>
      ${c !== combos[combos.length-1] ? '<div class="divider"></div>' : ""}`).join("") +
      `<div class="text-center mt-2"><a href="/combos" class="btn btn-outline btn-sm">View all combos</a></div>`;
  }

  function renderInsights(insights) {
    const el = $("#insightsList");
    if (!insights || !insights.length) { el.innerHTML = emptySmall("No insights yet."); return; }
    el.innerHTML = `<div class="insight-list">${insights.slice(0, 6).map((i) =>
      `<div class="insight-item"><i class="bi bi-lightbulb-fill bulb"></i><span>${esc(i)}</span></div>`).join("")}</div>`;
  }

  function renderRecent(txs) {
    const el = $("#recentTxs");
    if (!txs || !txs.length) { el.innerHTML = emptySmall("No transactions recorded yet."); return; }
    el.innerHTML = `<div class="table-wrap" style="border:none">
      <table class="table">
        <thead><tr>
          <th>Transaction</th><th>Customer</th><th>Date</th><th>Product</th>
          <th class="num">Qty</th><th class="num">Amount</th>
        </tr></thead>
        <tbody>${txs.map((t) => `<tr>
          <td><span class="badge badge-flat">${esc(t.transaction_id)}</span></td>
          <td>${esc(t.customer_id)}</td>
          <td>${esc(t.date)}</td>
          <td>${emojiFor(t.product)} ${esc(t.product)}</td>
          <td class="num">${fmt(t.quantity)}</td>
          <td class="num"><strong>${fmtMoney(t.total_amount)}</strong></td>
        </tr>`).join("")}</tbody>
      </table></div>`;
  }

  function emptySmall(msg) {
    return `<div class="empty-state" style="padding:28px 12px"><div class="empty-icon" style="width:60px;height:60px;font-size:26px;border-radius:18px">📭</div><p>${msg}</p></div>`;
  }

  function firstLabel(s) { return String(s).trim(); }

  /* ---------------- widget controls ---------------- */
  function bindWidgets() {
    // mode toggles
    $$("#revMode button").forEach((b) => b.addEventListener("click", () => {
      $$("#revMode button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      state.revMode = b.dataset.mode;
      renderRevenueChart();
    }));
    $$("#topMode button").forEach((b) => b.addEventListener("click", () => {
      $$("#topMode button").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      state.topMode = b.dataset.mode;
      renderTopProductsChart();
    }));

    // hide widget
    $$(".widget-hide").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const w = btn.closest(".widget");
        const key = w.dataset.widget;
        const hidden = getHidden();
        hidden.push(key);
        localStorage.setItem(WIDGET_HIDDEN_KEY, JSON.stringify(hidden));
        w.style.display = "none";
        toast("info", "Widget hidden", "Use “Widgets” to bring it back.");
      });
    });

    // drag reorder
    let dragEl = null;
    $$(".widget-header[draggable]").forEach((h) => {
      h.addEventListener("dragstart", (e) => {
        dragEl = h.closest(".widget");
        dragEl.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      h.addEventListener("dragend", () => {
        if (dragEl) { dragEl.classList.remove("dragging"); dragEl = null; }
        persistOrder();
      });
    });
    const grid = $("#widgetGrid");
    $$(".widget", grid).forEach((w) => {
      w.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!dragEl || dragEl === w) return;
        const after = w.getBoundingClientRect().top + w.getBoundingClientRect().height / 2 > e.clientY;
        grid.insertBefore(dragEl, after ? w : w.nextSibling);
      });
    });

    applyWidgetPrefs();
  }

  function getHidden() {
    try { return JSON.parse(localStorage.getItem(WIDGET_HIDDEN_KEY) || "[]"); } catch (e) { return []; }
  }
  function persistOrder() {
    const order = $$(".widget", $("#widgetGrid")).map((w) => w.dataset.widget);
    localStorage.setItem(WIDGET_ORDER_KEY, JSON.stringify(order));
  }
  function applyWidgetPrefs() {
    const hidden = getHidden();
    $$(".widget").forEach((w) => {
      if (hidden.includes(w.dataset.widget)) w.style.display = "none";
    });
  }

  // Widget palette modal
  window.widgetPalette = function () {
    const hidden = getHidden();
    const all = $$(".widget").map((w) => ({
      key: w.dataset.widget,
      label: w.querySelector("h3").textContent,
      visible: !hidden.includes(w.dataset.widget),
    }));
    openModal(`<div class="modal-header"><h3><i class="bi bi-ui-checks"></i> Dashboard Widgets</h3>
      <button class="icon-btn" onclick="closeModal()"><i class="bi bi-x-lg"></i></button></div>
      <div class="modal-body">
        <p class="text-muted mb-3 text-small">Toggle widgets on / off. Changes are remembered on this browser.</p>
        ${all.map((w) => `<div class="d-flex align-center justify-between" style="padding:9px 2px;border-bottom:1px dashed var(--border)">
          <strong>${esc(w.label)}</strong>
          <label class="switch"><input type="checkbox" ${w.visible ? "checked" : ""} data-widget-key="${w.key}"><span class="slider"></span></label>
        </div>`).join("")}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      </div>`);
    setTimeout(() => {
      $$("#modalBox input[type=checkbox]").forEach((c) => c.addEventListener("change", () => {
        let h = getHidden();
        if (c.checked) h = h.filter((k) => k !== c.dataset.widgetKey);
        else h.push(c.dataset.widgetKey);
        localStorage.setItem(WIDGET_HIDDEN_KEY, JSON.stringify(h));
        const target = $(`.widget[data-widget="${c.dataset.widgetKey}"]`);
        if (target) target.style.display = c.checked ? "flex" : "none";
      }));
    }, 60);
  };

  window.resetLayout = function () {
    localStorage.removeItem(WIDGET_ORDER_KEY);
    localStorage.removeItem(WIDGET_HIDDEN_KEY);
    location.reload();
  };

  // Quick action helpers
  window.goUpload = () => (window.location.href = "/upload");
  window.goBasket = () => (window.location.href = "/basket-analysis");
  window.goRecs = () => (window.location.href = "/recommendations");
  window.goCombos = () => (window.location.href = "/combos");
  window.goProducts = () => (window.location.href = "/products");
  window.goReport = () => (window.location.href = "/reports");

  // Run analysis shortcut -> runs analysis with defaults then toasts
  function runAnalysisNow(btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spinner"></i> Analyzing…';
    fetch("/api/basket-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ min_support: 0.01, min_confidence: 0.3, min_lift: 1.0, algorithm: "apriori" }),
    }).then((r) => r.json()).then((d) => {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-play-fill"></i> Run Analysis';
      if (d.error) toast("warning", "Analysis", d.error);
      else toast("success", "Analysis complete", `${d.stats.n_rules} association rules generated.`);
    }).catch(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-play-fill"></i> Run Analysis';
      toast("error", "Analysis", "Something went wrong.");
    });
  }

  function initSampleLoad() {
    const btn = $("#loadSampleBtn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      btn.disabled = true;
      btn.innerHTML = '<i class="bi bi-arrow-repeat spinner"></i> Loading…';
      fetch("/api/load-sample", { method: "POST" }).then((r) => r.json()).then((d) => {
        if (!d.ok) {
          toast("error", "Sample data", d.error || "Failed");
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-file-earmark-arrow-down"></i> Load Sample Data';
          return;
        }
        toast("success", "Sample dataset loaded", `${d.summary.cleaned_records} records loaded — refreshing dashboard.`);
        setTimeout(() => location.reload(), 900);
      });
    });
  }

  function boot() {
    if (window.__dashBooted) return;
    window.__dashBooted = true;
    load();
    bindWidgets();
    initSampleLoad();
    const raBtn = $("#runAnalysisBtn");
    if (!raBtn) return;
    raBtn.addEventListener("click", () => runAnalysisNow(raBtn));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();