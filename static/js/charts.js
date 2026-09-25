/* ==========================================================================
   Chart.js helpers — theme-aware defaults, managed charts (auto destroy),
   consistent styling + tooltips.
   ========================================================================== */
(function () {
  "use strict";

  window.Charts = {};
  const registry = {}; // id -> chart instance

  // Palette used across the whole app
const PALETTE = ["#ea580c", "#f59e0b", "#eab308", "#fb923c", "#16a34a",
"#0ea5e9", "#e11d48", "#d97706", "#a16207", "#78716c"];

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  // Expose for other modules (safe, resolves at call time)
  window.themeCss = cssVar;

  // Destroy any previous chart bound to this canvas, then return the canvas
  function _getCanvas(id) {
    if (registry[id]) { try { registry[id].destroy(); } catch (e) { /* ignore */ } delete registry[id]; }
    return document.getElementById(id);
  }

  function palette(n) {
    let p = [...PALETTE];
    while (p.length < n) p = p.concat(PALETTE);
    return p.slice(0, n);
  }

  const fmtMoney = (v) => "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  function baseOptions() {
    const text = cssVar("--muted") || "#94a3b8";
    const grid = cssVar("--border") || "#e3e9f4";
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      color: text,
      plugins: {
        legend: {
          labels: { usePointStyle: true, pointStyleWidth: 8, boxWidth: 8, color: text, font: { size: 11.5 } },
        },
        tooltip: {
          backgroundColor: cssVar("--text") || "#101828",
          titleColor: cssVar("--bg") || "#fff",
          bodyColor: cssVar("--bg") || "#fff",
          padding: 12, cornerRadius: 10,
          titleFont: { weight: "700" },
        },
      },
      scales: {
        x: { grid: { color: grid }, ticks: { color: text, maxRotation: 55, minRotation: 0, maxTicksLimit: 10 } },
        y: { grid: { color: grid }, ticks: { color: text, callback: (v) => (v >= 1000 ? (v / 1000) + "k" : v) } },
      },
    };
  }

  // line / bar
  window.createLine = function (id, labels, data, opts = {}) {
    const cfg = baseOptions();
    return registry[id] = new Chart(_getCanvas(id), {
      type: opts.type || "line",
      data: {
        labels,
        datasets: [{
          label: opts.label || "Value",
          data,
          borderColor: PALETTE[0],
          backgroundColor: "rgba(234,88,12,0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 3, pointHoverRadius: 6,
          borderWidth: 2.5,
        }],
      },
      options: { ...cfg, ...(opts.options || {}) },
    });
  };

  window.createBar = function (id, labels, data, opts = {}) {
    const cfg = baseOptions();
    const colors = opts.colors || Array(labels.length).fill(PALETTE[0]);
    return registry[id] = new Chart(_getCanvas(id), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: opts.label || "Value",
          data,
          backgroundColor: colors,
          borderRadius: 8, borderSkipped: false,
          maxBarThickness: opts.maxBarThickness || 42,
        }],
      },
      options: {
        ...cfg,
        plugins: { ...cfg.plugins, legend: { display: false } },
        scales: { x: cfg.scales.x, y: cfg.scales.y },
      },
    });
  };

  window.createDoughnut = function (id, labels, data, opts = {}) {
    const cfg = baseOptions();
    return registry[id] = new Chart(_getCanvas(id), {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: palette(labels.length),
          borderColor: cssVar("--surface") || "#fff",
          borderWidth: 3,
          hoverOffset: 10,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 750 },
        cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, pointStyleWidth: 8, boxWidth: 8, color: cssVar("--muted"), font: { size: 11.5 }, padding: 12 },
          },
          tooltip: { callbacks: { label: (c) => ` ${c.label}: ${c.parsed}${opts.unit ? " " + opts.unit : ""}` } },
        },
        onClick: opts.onClick,
      },
    });
  };

  // scatter (bubble) — x, y, radius, colour
  window.createScatter = function (id, points, opts = {}) {
    return registry[id] = new Chart(_getCanvas(id), {
      type: "bubble",
      data: {
        datasets: [{
          label: opts.label || "Association rules",
          data: points.map((p, i) => ({
            x: p.x, y: p.y, r: Math.max(4, Math.min(24, p.r * 5)),
            rule: p.rule, conf: p.x, sup: p.y, lift: p.r,
          })),
          backgroundColor: "rgba(251,146,60,0.55)",
          borderColor: "rgba(251,146,60,0.95)",
          borderWidth: 1.5,
          hoverBackgroundColor: "rgba(245,158,11,0.7)",
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 900 },
        scales: {
          x: { title: { display: true, text: "Confidence", font: { weight: "700" } }, min: 0, suggestedMax: 1, grid: { color: cssVar("--border") }, ticks: { color: cssVar("--muted") } },
          y: { title: { display: true, text: "Support", font: { weight: "700" } }, min: 0, suggestedMax: 0.5, grid: { color: cssVar("--border") }, ticks: { color: cssVar("--muted") } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => {
                const d = c.raw;
                return ` ${d.rule}\n  Support: ${(d.sup * 100).toFixed(1)}%\n  Confidence: ${(d.conf * 100).toFixed(1)}%\n  Lift: ${d.lift.toFixed(2)}`;
              },
            },
          },
        },
      },
    });
  };

  // multipurpose horizontal bar for top-N
  window.createHBar = function (id, labels, data, opts = {}) {
    const cfg = baseOptions();
    return registry[id] = new Chart(_getCanvas(id), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: opts.label || "Value",
          data,
          backgroundColor: opts.colors || ["#ea580c"],
          borderRadius: 8, borderSkipped: false,
          maxBarThickness: opts.maxBarThickness || 24,
        }],
      },
      options: {
        ...cfg,
        indexAxis: "y",
        plugins: { ...cfg.plugins, legend: { display: false } },
        scales: {
          x: { grid: { color: cssVar("--border") }, ticks: { color: cssVar("--muted"), callback: (v) => (v >= 1000 ? (v / 1000) + "k" : v) } },
          y: { grid: { display: false }, ticks: { color: cssVar("--text-2"), font: { size: 11.5 } } },
        },
      },
    });
  };

  // Generic multi-line comparison chart
  window.createMultiLine = function (id, labels, datasets, opts = {}) {
    const cfg = baseOptions();
    return registry[id] = new Chart(_getCanvas(id), {
      type: "line",
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          label: d.label,
          data: d.data,
          borderColor: palette(datasets.length)[i],
          backgroundColor: palette(datasets.length)[i] + "22",
          fill: d.fill || false,
          tension: 0.35, pointRadius: 3, borderWidth: 2.5,
        })),
      },
      options: { ...cfg, ...(opts.options || {}) },
    });
  };

  window.chartPalette = function (n) { return palette(n); };

  // destroy + recreate on theme change
  window.refreshAllCharts = function () {
    Object.values(registry).forEach((c) => {
      try { c.update(); } catch (e) { /* ignore */ }
    });
    document.dispatchEvent(new CustomEvent("charts-refresh"));
  };
  document.addEventListener("themechange", () => setTimeout(refreshAllCharts, 60));

  window.Charts.registry = registry;
})();
