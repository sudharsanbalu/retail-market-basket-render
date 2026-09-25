/* ==========================================================================
   Product Explorer — search / category / sort / pagination, product cards,
   product detail drawer with "frequently purchased with".
   ========================================================================== */
(function () {
  "use strict";
  const $ = window.qs, $$ = window.qsa;

  const state = { search: "", category: "", sort: "revenue", page: 1, per: 12 };

  function getUrl() {
    const p = new URLSearchParams({
      search: state.search, category: state.category, sort: state.sort,
      order: state.order || undefined, page: state.page, per_page: state.per,
    });
    return `/api/products?${p}`;
  }

  function load() {
    $("#prodGrid").innerHTML = skeletonHTML(6);
    fetch(getUrl()).then((r) => r.json()).then((d) => {
      $("#prodEmpty").style.display = d.has_data && d.items.length ? "none" : "block";
      if (!d.has_data) { $("#prodGrid").innerHTML = ""; $("#prodPagination").innerHTML = ""; $("#prodCount").textContent = "No products"; return; }
      populateCategories(d.categories);
      $("#prodCount").textContent = `${fmt(d.total)} products found`;
      renderProducts(d.items);
      renderPagination(d);
      const focus = new URLSearchParams(location.search).get("focus");
      if (focus && d.items.length) {
        const hit = d.items.find((i) => i.product.toLowerCase() === focus.toLowerCase());
        if (hit) openProductDrawer(hit.product);
      }
    }).catch(() => toast("error", "Products", "Failed to load products."));
  }

  function populateCategories(cats) {
    const sel = $("#prodCategory");
    if (sel.dataset.ready) return;
    sel.dataset.ready = "1";
    cats.forEach((c) => { const o = document.createElement("option"); o.value = c; o.textContent = c; sel.appendChild(o); });
  }

  function renderProducts(items) {
    $("#prodGrid").innerHTML = items.map((p, i) => `
      <div class="product-card fade-up" style="animation-delay:${Math.min(i, 10) * 40}ms" onclick="window.openProductDrawer('${esc(p.product)}')">
        <div class="d-flex align-center justify-between">
          <span class="badge badge-flat">#${p.rank}</span>
          <span class="badge badge-muted">${esc(p.category)}</span>
        </div>
        <div class="product-emoji">${emojiFor(p.product)}</div>
        <div class="product-name">${esc(p.product)}</div>
        <div class="product-cat"><i class="bi bi-tag"></i> ₹${fmt(p.price)}</div>
        <div class="product-stats">
          <span title="Revenue"><i class="bi bi-currency-rupee text-primary"></i> ${fmtMoney(p.revenue)}</span>
          <span title="Quantity"><i class="bi bi-boxes"></i> ${fmt(p.quantity)}</span>
          <span title="Transactions"><i class="bi bi-cart3"></i> ${fmt(p.transactions)}</span>
        </div>
        <div class="product-overlay">
          <button class="btn btn-primary" onclick="event.stopPropagation();window.openProductDrawer('${esc(p.product)}')"><i class="bi bi-graph-up"></i> View Analytics</button>
          <button class="btn btn-white" style="background:#fff;color:var(--primary)" onclick="event.stopPropagation();window.location.href='/basket-analysis?focus=${encodeURIComponent(p.product)}'"><i class="bi bi-link-45deg"></i> Find Associations</button>
        </div>
      </div>`).join("");
  }

  function renderPagination(d) {
    const el = $("#prodPagination");
    $("#prodPageInfo").textContent = `Page ${d.page} of ${d.pages} · ${fmt(d.total)} items`;
    if (d.pages <= 1) { el.innerHTML = ""; return; }
    const btns = [];
    const go = (pg) => `<button class="page-btn ${pg === d.page ? "active" : ""}" data-page="${pg}">${pg}</button>`;
    for (let i = 1; i <= d.pages; i++) {
      if (i === 1 || i === d.pages || (i >= d.page - 2 && i <= d.page + 2)) btns.push(go(i));
      else if (btns[btns.length - 1] !== "…") btns.push("…");
    }
    el.innerHTML = `<button class="page-btn" data-page="${d.page - 1}" ${d.page === 1 ? "disabled" : ""}>‹</button>` +
      btns.join("") +
      `<button class="page-btn" data-page="${d.page + 1}" ${d.page === d.pages ? "disabled" : ""}>›</button>`;
    $$("[data-page]", el).forEach((b) => b.addEventListener("click", () => {
      if (b.disabled || b.dataset.page === "…") return;
      if (b.dataset.page === "…") return;
      state.page = parseInt(b.dataset.page, 10);
      load();
    }));
  }

  // debounced search
  let t;
  $("#prodSearch").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.search = e.target.value; state.page = 1; load(); }, 260);
  });
  $("#prodCategory").addEventListener("change", (e) => { state.category = e.target.value; state.page = 1; load(); });
  $("#prodSort").addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; load(); });

  /* ---------------- product drawer ---------------- */
  window.openProductDrawer = function (name) {
    openDrawer(`Product Analytics · ${esc(name)}`,
      skeletonHTML(7), '<div class="text-muted text-small">Loading details…</div>');

    const info = fetch(`/api/products?search=${encodeURIComponent(name)}&per_page=1`);
    const assoc = fetch(`/api/products/${encodeURIComponent(name)}/associations`);
    Promise.all([info.then((r) => r.json()), assoc.then((r) => r.json())]).then(([d, a]) => {
      const p = d.items[0];
      if (!p) { closeDrawer(); return; }
      openDrawer(`Product Analytics · ${esc(p.product)}`,
        `<div class="d-flex align-center gap-3 mb-3">
          <div class="product-emoji" style="width:56px;height:56px;font-size:30px">${emojiFor(p.product)}</div>
          <div><div class="fw-800" style="font-size:19px">${esc(p.product)}</div>
            <span class="badge badge-muted">${esc(p.category)}</span>
            <span class="badge badge-primary"><i class="bi bi-trophy"></i> Rank #${p.rank}</span></div>
        </div>
        <div class="kv-grid" style="grid-template-columns:repeat(3,1fr)">
          ${[["Revenue", fmtMoney(p.revenue)], ["Quantity Sold", fmt(p.quantity)],
            ["Transactions", fmt(p.transactions)], ["Avg. Price", "₹" + fmt(p.price)],
            ["Popularity", p.rank > 10 ? "rising" : "top " + p.rank], ["Sell-through", fmt(Math.round(p.transactions)) + " txns"]].map(([k, v]) =>
              `<div class="kv-item"><div class="k">${k}</div><div class="v" style="font-size:14px">${v}</div></div>`).join("")}
        </div>
        <div class="divider"></div>
        <h4 class="fw-700 mb-2" style="font-size:14px"><i class="bi bi-link-45deg text-primary"></i> Frequently purchased with this product</h4>
        ${(a.associations || []).map((r, i) =>
          `<div class="d-flex align-center justify-between" style="padding:10px 2px;border-bottom:1px dashed var(--border)">
            <div class="d-flex align-center gap-2"><span class="badge badge-primary">${i + 1}</span>
            <strong>${emojiFor(r.product)} ${esc(r.product)}</strong></div>
            <div class="d-flex align-center gap-2">
              <span class="badge badge-accent">${r.confidence_pct}% conf</span>
              <span class="badge badge-success">lift ${r.lift}</span>
            </div></div>`).join("") ||
          '<div class="text-muted text-small">No strong associations found yet — run the basket analysis first.</div>'}
        <button class="why-btn mt-2" onclick="window.whyAssoc('${esc(a.product || p.product)}')" style="margin-top:12px">
          <i class="bi bi-question-circle"></i> Why are these recommended together?</button>`,
        `<div class="d-flex gap-2" style="width:100%">
          <button class="btn btn-outline btn-sm" style="flex:1" onclick="window.location.href='/recommendations?product=${encodeURIComponent(p.product)}'">
            <i class="bi bi-lightbulb"></i> Recommend for ${esc(p.product)}</button>
          <button class="btn btn-ghost btn-sm" style="flex:1" onclick="window.location.href='/basket-analysis?focus=${encodeURIComponent(p.product)}'">
            <i class="bi bi-link-45deg"></i> Find Associations</button>
        </div>`);
    });
  };

  window.whyAssoc = function (product) {
    toast("info", "Why these recommendations?", `Products are paired from actual association rules where "${product}" appears — based on support, confidence and lift from your transactions.`);
  };

  // pre-select category filter when ?category= given
  const urlParams = new URLSearchParams(location.search);
  if (urlParams.get("category")) state.category = urlParams.get("category");
  if (urlParams.get("focus")) state.search = urlParams.get("focus");

  load();
})();