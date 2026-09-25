/* ==========================================================================
   Product Recommendations — product chooser, animated recommendation cards
   with confidence/lift meters and expandable "why" explanations.
   ========================================================================== */
(function () {
  "use strict";
  const $ = window.qs, $$ = window.qsa;

  const chooser = $("#productChooser");
  const results = $("#recResults");
  const empty = $("#recEmpty");
  let products = [];
  let selected = null;

  function loadProducts() {
    fetch("/api/recommendations").then((r) => r.json()).then((d) => {
      if (!d.has_data) {
        const ea = $("#recEmpty");
        ea.style.display = "block";
        ea.querySelector(".empty-state p").textContent =
          "Upload a dataset to start receiving product recommendations.";
        ea.innerHTML = `<div class="empty-state"><div class="empty-icon">🛍️</div>
          <h3>No dataset loaded</h3><p>Upload a retail dataset or load the sample to discover product recommendations.</p>
          <button class="btn btn-primary" onclick="window.location.href='/upload'"><i class="bi bi-cloud-arrow-up"></i> Upload Dataset</button></div>`;
        chooser.innerHTML = "";
        return;
      }
      products = d.products;
      chooser.innerHTML = d.products.map((p) => `
        <button class="prod-choice" data-product="${esc(p)}">
          <span class="pc-emoji">${emojiFor(p)}</span> ${esc(p)}
        </button>`).join("");

      $$("[data-product]", chooser).forEach((b) => b.addEventListener("click", () => select(b.dataset.product, b)));

      // support ?product=deep-link
      const urlParams = new URLSearchParams(location.search);
      const focus = urlParams.get("product");
      if (focus && products.map((p) => p.toLowerCase()).includes(focus.toLowerCase())) {
        const target = $$("[data-product]", chooser).find((b) => b.dataset.product.toLowerCase() === focus.toLowerCase());
        if (target) select(focus, target);
      } else {
        const first = $$("[data-product]", chooser)[0];
        if (first) select(first.dataset.product, first);
      }
    }).catch(() => toast("error", "Recommendations", "Failed to load products."));
  }

  function select(name, btn) {
    selected = name;
    $$("[data-product]", chooser).forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    empty.style.display = "none";
    results.innerHTML = `<div class="d-flex align-center gap-2 mb-3 text-muted">
      <i class="bi bi-arrow-repeat spinner"></i> Mining association rules for <strong>${esc(name)}</strong>…</div>`;
    $("#recCount").textContent = "…";

    fetch(`/api/recommendations/${encodeURIComponent(name)}`).then((r) => r.json()).then((d) => {
      if (d.error) {
        results.innerHTML = `<div class="card"><div class="card-body"><div class="alert alert-warning">
          <i class="bi bi-exclamation-triangle-fill"></i><div><strong>${esc(d.error)}</strong>
          <div class="text-small">Go to Market Basket Analysis and lower the thresholds, or upload a richer dataset.</div></div></div></div></div>`;
        $("#recCount").textContent = "0";
        return;
      }
      renderRecs(d);
    }).catch(() => { results.innerHTML = ""; toast("error", "Recommendations", "Request failed."); });
  }

  function renderRecs(d) {
    $("#recCount").textContent = `${d.count} recommendations`;
    if (!d.recommendations.length) {
      results.innerHTML = `<div class="card"><div class="card-body"><div class="empty-state" style="padding:34px">
        <div class="empty-icon" style="width:64px;height:64px;font-size:28px">🔗</div>
        <h3>No strong recommendations for ${esc(d.product)}</h3>
        <p>No rule with ${esc(d.product)} passed the default thresholds. Try running the basket analysis with lower support/confidence.</p>
        <button class="btn btn-primary" onclick="window.location.href='/basket-analysis'"><i class="bi bi-link-45deg"></i> Open Basket Analysis</button>
      </div></div></div>`;
      return;
    }

    const strengthColor = (s) => s === "Strong" ? "success" : s === "Moderate" ? "warning" : "muted";
    results.innerHTML = `
      <div class="card mb-3" style="border:none;background:var(--grad-soft)">
        <div class="card-body text-center">
          <h3 style="font-size:17px;font-weight:800">Customers who purchase <span style="color:var(--primary)">${emojiFor(d.product)} ${esc(d.product)}</span>
          also frequently purchase…</h3>
        </div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px" id="recGrid">
        ${d.recommendations.map((r, i) => `
          <div class="rec-card" style="animation-delay:${i * 90}ms">
            <div class="rec-head">
              <div class="rec-emoji">${emojiFor(r.product)}</div>
              <div class="w-100" style="flex:1">
                <div class="rec-name">${esc(r.product)}</div>
                <div class="rec-rule"><i class="bi bi-link-45deg"></i> ${esc(r.rule || `${d.product} → ${r.product}`)}</div>
              </div>
              <span class="badge badge-${strengthColor(r.strength)}">${r.strength}</span>
            </div>

            <div class="rec-metrics">
              <div class="combo-metric"><div class="v">${r.lift}</div><div class="l">Lift</div></div>
              <div class="combo-metric"><div class="v">${r.confidence_pct}%</div><div class="l">Confidence</div></div>
              <div class="combo-metric"><div class="v">${r.support_pct}%</div><div class="l">Support</div></div>
            </div>

            <div>
              <div class="d-flex align-center justify-between mb-1"><span class="text-small text-muted">Confidence strength</span>
              <span class="text-small fw-700">${r.confidence_pct}%</span></div>
              <div class="meter"><div class="fill" data-width="${Math.min(100, r.confidence_pct)}"></div></div>
            </div>

            <button class="why-btn" data-why="${esc(r.product.replace(/'/g, "\\u0027"))}">
              <i class="bi bi-question-circle"></i> Why this recommendation?
            </button>
            <div class="why-box">
              <strong>Why you're seeing this</strong>
              <div style="margin-top:6px">${esc(r.reason)}</div>
              <ul>
                <li>Derived from the rule <strong>${esc(r.rule || `${d.product} → ${r.product}`)}</strong></li>
                <li>Confidence ${r.confidence_pct}% — ${esc(d.product)} → ${esc(r.product)}</li>
                <li>Lift ${r.lift} ${r.lift >= 1 ? "(>1 — genuine association)" : "(<1)"}</li>
              </ul>
            </div>
          </div>`).join("")}
      </div>`;

    // animate meters
    setTimeout(() => {
      $$("#recGrid .fill").forEach((f) => { f.style.width = f.dataset.width + "%"; });
    }, 150);

    // why toggles
    $$("#recGrid .why-btn").forEach((b) => b.addEventListener("click", () => {
      const card = b.closest(".rec-card");
      card.classList.toggle("expanded");
      b.innerHTML = card.classList.contains("expanded")
        ? '<i class="bi bi-dash-circle"></i> Hide explanation'
        : '<i class="bi bi-question-circle"></i> Why this recommendation?';
    }));
  }

  loadProducts();
})();