/* ==========================================================================
   Sales Analytics — dynamic date filtering and interactive charts.
   ========================================================================== */
(function () {
  "use strict";
  const $ = window.qs, $$ = window.qsa;

  let range = "all";

  const METRIC_DEFS = [
    { key: "total_revenue", label: "Total Revenue", icon: "bi-currency-rupee", tone: "t-green", money: true },
    { key: "total_quantity", label: "Total Quantity Sold", icon: "bi-boxes", tone: "t-blue", money: false, suffix: "" },
    { key: "avg_transaction_value", label: "Avg. Transaction Value", icon: "bi-cash-stack", tone: "t-amber", money: true },
    { key: "num_transactions", label: "Transactions", icon: "bi-receipt", tone: "t-rose", money: false },
  ];

  function load(retries = 3) {
    const params = new URLSearchParams({ range });
    if (range === "custom") {
      params.set("start", $("#startDate").value);
      params.set("end", $("#endDate").value);
    }
    fetch(`/api/sales?${params}`, { cache: "no-store" })
      .then(async (r) => {
        const txt = await r.text();
        let d;
        try { d = JSON.parse(txt); } catch (e) {
          throw new Error("HTTP " + r.status + " (non-JSON response: " + txt.slice(0, 140).replace(/\n/g, " ") + ")");
        }
        return d;
      })
      .then((d) => {
      if (!d.has_data) {
        $("#analyticsEmpty").style.display = "block";
        $("#analyticsBody").style.display = "none";
        $("#salesMetrics").innerHTML = "";
        const hasDataset = !!(d.period);
        $("#emptyTitle").textContent = hasDataset
          ? "No transactions in this range"
          : "No sales data available";
        $("#emptyDesc").textContent = hasDataset
          ? "The selected date range has no transactions. Pick a wider range from the buttons above."
          : "Upload a retail dataset to analyse daily and monthly sales patterns.";
        $("#emptyBtn").style.display = hasDataset ? "none" : "inline-flex";
        return;
      }
      $("#analyticsEmpty").style.display = "none";
      $("#analyticsBody").style.display = "grid";
      renderMetrics(d.metrics);
      renderCharts(d.charts);
      if (d.period) applyPeriodBounds(d.period);
    }).catch((err) => {
      console.error("[analytics] load failed:", err && err.stack ? err.stack : err);
      if (retries > 1) {
        setTimeout(() => load(retries - 1), 700);
        return;
      }
      const reason = (err && (err.message || err.name)) || "unknown error";
      toast("error", "Sales analytics", `Failed to load analytics (${reason})`);
    });
  }

  function applyPeriodBounds(period) {
    const st = $("#startDate"), en = $("#endDate");
    if (st.max === period.end) return; // already initialized
    st.min = period.start; st.max = period.end;
    en.min = period.start; en.max = period.end;
    // Default custom window: the last 30 days of the dataset
    const defStart = new Date(period.end);
    defStart.setDate(defStart.getDate() - 29);
    if (!st.value) st.value = defStart.toISOString().slice(0, 10);
    if (!en.value) en.value = period.end;
  }

  function renderMetrics(m) {
    $("#salesMetrics").innerHTML = METRIC_DEFS.map((d) => `
      <div class="kpi-card fade-up">
        <div class="kpi-top"><div class="kpi-icon ${d.tone}"><i class="bi ${d.icon}"></i></div>
          <span class="badge badge-flat"><i class="bi bi-arrow-repeat" onclick="location.reload()" title="Refresh"></i></span></div>
        <div class="kpi-label">${d.label}</div>
        <div class="kpi-value">${d.money ? fmtMoney(m[d.key]) : fmt(m[d.key])}</div>
        <div class="sub">${range === "custom" ? "custom range" : range.replace("_", " ")}</div>
      </div>`).join("");
  }

  function renderCharts(c) {
    skeletonSafe("dailyChart", c.daily.length);
    skeletonSafe("monthlyChart", c.monthly.length);
    skeletonSafe("top10Chart", c.top_products.length);
    skeletonSafe("categoryDoughnutChart", c.categories.length);
    skeletonSafe("categoryBarChart", c.categories.length);
    skeletonSafe("qtyChart", c.quantity_by_product.length);

    if (c.daily.length) createBar("dailyChart", c.daily.map(d => d.date), c.daily.map(d => d.revenue), {
      label: "Revenue", colors: chartPalette(c.daily.length), maxBarThickness: 20,
    });
    if (c.monthly.length) createLine("monthlyChart", c.monthly.map(d => d.month), c.monthly.map(d => d.revenue), {
      label: "Revenue",
      options: { plugins: { tooltip: { callbacks: { label: (ctx) => ` Revenue: ${fmtMoney(ctx.parsed.y)}` } } } },
    });
    if (c.top_products.length) createHBar("top10Chart",
      c.top_products.map(p => p.product),
      c.top_products.map(p => Math.round(p.revenue)),
      { label: "Revenue", colors: chartPalette(c.top_products.length) });
    if (c.categories.length) {
      const labels = c.categories.map(x => x.category);
      createDoughnut("categoryDoughnutChart", labels, c.categories.map(x => Math.round(x.revenue)), {
        unit: "₹", onClick: (evt, els) => {
          if (els.length) window.location.href = `/products?category=${encodeURIComponent(labels[els[0].index])}`;
        },
      });
    }
    if (c.categories.length) createBar("categoryBarChart",
      c.categories.map(x => x.category),
      c.categories.map(x => x.items),
      { label: "Items", colors: chartPalette(c.categories.length), maxBarThickness: 34 });
    if (c.quantity_by_product.length) createHBar("qtyChart",
      c.quantity_by_product.map(p => p.product),
      c.quantity_by_product.map(p => Math.round(p.quantity)),
      { label: "Quantity", colors: ["#10b981"] });
  }

  function skeletonSafe(id, hasData) {
    const canvas = document.getElementById(id);
    const box = canvas.closest(".chart-box");
    const sk = box ? box.querySelector(".chart-skeleton") : null;
    if (!hasData) {
      if (sk) sk.style.display = "block";
      canvas.style.display = "none";
    } else {
      if (sk) sk.style.display = "none";
      canvas.style.display = "block";
    }
  }

  // date filter wiring
  $$("#dateFilter button").forEach((b) => b.addEventListener("click", () => {
    $$("#dateFilter button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    range = b.dataset.range;
    $("#customRange").style.display = range === "custom" ? "flex" : "none";
    load();
  }));

  $("#startDate").addEventListener("change", () => range === "custom" && load());
  $("#endDate").addEventListener("change", () => range === "custom" && load());

  load();
})();