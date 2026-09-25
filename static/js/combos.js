/* ==========================================================================
   Combo Generator — combo cards, "generate new", customise modal
   (add/remove products, rename, promo text, preview + print).
   ========================================================================== */
(function () {
  "use strict";
  const $ = window.qs, $$ = window.qsa;

  const grid = $("#comboGrid");
  let combos = [];
  let allProducts = [];

  function loadCombos() {
    fetch("/api/combos").then((r) => r.json()).then((d) => {
      if (!d.has_data) {
        grid.innerHTML = "";
        $("#comboEmpty").style.display = "block";
        return;
      }
      $("#comboEmpty").style.display = "none";
      combos = d.combos || [];
      $("#comboInsight").innerHTML = `<i class="bi bi-lightbulb"></i> ${esc(d.insight || "")}`;
      renderCombos();
    }).catch(() => toast("error", "Combos", "Failed to load combos."));
  }

  function renderCombos() {
    if (!combos.length) {
      grid.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="card-body text-muted text-small">
        No smart combos could be generated with the current data. Try uploading a dataset with more transactions.</div></div>`;
      return;
    }
    grid.innerHTML = combos.map((c, i) => `
      <div class="combo-card fade-up" style="animation-delay:${i * 80}ms">
        <span class="badge badge-primary" style="position:relative;z-index:2">Combo #${i + 1}</span>
        <div class="combo-name" style="margin-top:10px">${esc(c.name)}</div>
        <div class="combo-tag"><i class="bi bi-bar-chart"></i> mined from ${c.support}% of baskets</div>

        <div class="combo-products">
          ${c.products.map((p, j) => `
            ${j ? '<span class="combo-plus">+</span>' : ""}
            <span class="combo-product" title="${esc(p)}">${emojiFor(p)}&nbsp;${esc(p)}</span>
          `).join("")}
        </div>

        <div class="combo-metrics">
          <div class="combo-metric"><div class="v">${c.confidence}%</div><div class="l">Confidence</div></div>
          <div class="combo-metric"><div class="v">${c.lift}</div><div class="l">Lift</div></div>
          <div class="combo-metric"><div class="v">${c.support}%</div><div class="l">Support</div></div>
        </div>

        <div class="combo-msg"><i class="bi bi-megaphone-fill text-primary"></i> ${esc(c.message)}</div>

        <div class="d-flex gap-2" style="justify-content:center">
          <button class="btn btn-outline btn-sm" onclick="window.customiseCombo(${c.id})"><i class="bi bi-pencil-square"></i> Customize</button>
          <button class="btn btn-primary btn-sm" onclick="window.previewCombo(${c.id})"><i class="bi bi-eye"></i> Preview Offer</button>
        </div>
      </div>`).join("");
  }

  /* ------- generate new (re-run with fresh settings) ------- */
  $("#genCombosBtn").addEventListener("click", () => {
    const btn = $("#genCombosBtn");
    btn.disabled = true;
    btn.innerHTML = '<i class="bi bi-arrow-repeat spinner"></i> Mining patterns…';
    // re-generate using the default analysis settings
    fetch("/api/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ min_support: 0.01, min_confidence: 0.3, min_lift: 1.0, algorithm: "apriori" }),
    }).then((r) => r.json()).then((d) => {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-magic"></i> Generate New Combos';
      if (d.error) { toast("warning", "Combos", d.error); return; }
      combos = d.combos || [];
      renderCombos();
      toast("success", "New combos", `${combos.length} fresh combo suggestions created.`);
    }).catch(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-magic"></i> Generate New Combos';
      toast("error", "Combos", "Failed to regenerate comobos.");
    });
  });

  /* ------- customize combo ------- */
  window.editComboState = null;

  window.customiseCombo = function (id) {
    const c = combos.find((x) => x.id === id);
    if (!c) return;
    loadAllProducts(() => {
      const state = { products: [...c.products], name: c.name, message: c.message, base: c };
      window.editComboState = state;
      renderCustomiseModal(state);
    });
  };

  function loadAllProducts(cb) {
    if (allProducts.length) { cb(); return; }
    fetch("/api/products?per_page=50&sort=quantity").then((r) => r.json()).then((d) => {
      allProducts = (d.items || []).map((p) => p.product);
      cb();
    }).catch(() => { allProducts = c.products; cb(); });
  }

  function renderCustomiseModal(state) {
    openModal(`
      <div class="modal-header"><h3><i class="bi bi-pencil-square text-primary"></i> Customize Combo</h3>
        <button class="icon-btn" onclick="closeModal()"><i class="bi bi-x-lg"></i></button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Combo name</label>
          <input type="text" class="form-control" id="comboName" value="${esc(state.name)}">
        </div>
        <div class="form-group">
          <div class="form-label"><span>Products in this combo</span><span class="text-muted text-small" id="comboCount">${state.products.length}</span></div>
          <div class="combo-products" id="comboEditChips" style="min-height:60px;border:1.5px dashed var(--border-2);border-radius:14px;padding:12px">
            ${state.products.map((p) => `<span class="combo-product" style="cursor:pointer;position:relative" data-remove="${esc(p)}" title="click to remove">${emojiFor(p)} ${esc(p)} <i class="bi bi-x-circle" style="color:var(--danger)"></i></span>`).join("") ||
            '<span class="text-muted text-small">No products yet — add some below.</span>'}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Add products</label>
          <input type="text" class="form-control" id="comboAddSearch" placeholder="type to filter products…">
          <div id="comboAddList" class="mt-2" style="max-height:190px;overflow-y:auto;display:flex;flex-wrap:wrap;gap:8px"></div>
        </div>
        <div class="form-group">
          <label class="form-label">Promotional message</label>
          <textarea class="form-control" id="comboMessage" rows="3">${esc(state.message)}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-ghost" onclick="window.regeneratePromo()"><i class="bi bi-magic"></i> Auto-promo</button>
        <button class="btn btn-primary" onclick="window.saveEditedCombo()"><i class="bi bi-check"></i> Save &amp; Preview</button>
      </div>`);

    // chips: remove
    $$("#comboEditChips [data-remove]").forEach((chip) => chip.addEventListener("click", () => {
      state.products = state.products.filter((p) => p !== chip.dataset.remove);
      renderCustomiseModal(state);
    }));

    renderAddables(state, "");
    $("#comboAddSearch").addEventListener("input", (e) => renderAddables(state, e.target.value));
  }

  function renderAddables(state, q) {
    const list = $("#comboAddList");
    const filtered = allProducts.filter((p) => {
      const inCombo = state.products.some((x) => x.toLowerCase() === p.toLowerCase());
      return !inCombo && (!q || p.toLowerCase().includes(q.toLowerCase()));
    }).slice(0, 24);
    if (!filtered.length) { list.innerHTML = '<span class="text-muted text-small">No more products to add.</span>'; return; }
    list.innerHTML = filtered.map((p) => `
      <span class="chip" style="cursor:pointer" data-add="${esc(p)}">${emojiFor(p)} ${esc(p)} +</span>`).join("");
    $$("#comboAddList [data-add]").forEach((chip) => chip.addEventListener("click", () => {
      state.products.push(chip.dataset.add);
      renderCustomiseModal(state);
    }));
  }

  window.regeneratePromo = function () {
    const s = window.editComboState;
    if (!s) return;
    s.message = makePromoMessage(s.products, s.name);
    const ta = $("#comboMessage");
    if (ta) ta.value = s.message;
  };

  window.saveEditedCombo = function () {
    const s = window.editComboState;
    if (!s) return;
    s.name = $("#comboName").value.trim() || s.name;
    s.message = $("#comboMessage").value.trim();
    window.previewCombo(null, s);
  };

  /* ------- preview + print ------- */
  function makePromoMessage(products, name) {
    const emojis = products.map((p) => emojiFor(p)).join(" ");
    return `Today only: grab the ${name} ${emojis} — ${products.join(", ")} — together and save! These products are frequently purchased together (confidence ${window.editComboState?.base?.confidence || "high"}, lift ${window.editComboState?.base?.lift || ">1"}) so stock up now!`;
  }

  window.previewCombo = function (id, overrides) {
    let c = id ? combos.find((x) => x.id === id) : null;
    const state = overrides || (c ? { name: c.name, products: c.products, message: c.message, confidence: c.confidence, lift: c.lift, support: c.support } : null);
    if (!state) return;

    const poster = $("#comboPoster");
    poster.style.display = "block";
    poster.innerHTML = `
      <div class="report-sheet" style="text-align:center;padding:40px">
        <div class="badge badge-primary mb-3"><i class="bi bi-tag-fill"></i> Limited-time offer</div>
        <h2 style="font-size:24px;font-weight:800;margin-bottom:6px">${esc(state.name)}</h2>
        <div class="text-muted mb-3">${esc(state.message)}</div>
        <div class="combo-products" style="margin-bottom:20px">
          ${state.products.map((p, j) => `${j ? '<span class="combo-plus">+</span>' : ""}<span class="combo-product">${emojiFor(p)}<br>${esc(p)}</span>`).join("")}
        </div>
        <div class="combo-metrics" style="grid-template-columns:repeat(3,1fr)">
          ${[["Support", state.support + "%"], ["Confidence", state.confidence + "%"], ["Lift", state.lift]].map(([l, v]) =>
            `<div class="combo-metric"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("")}
        </div>
      </div>`;

    window.editComboState = state;
    openModal(`
      <div class="modal-header"><h3><i class="bi bi-megaphone-fill text-primary"></i> Combo Offer Preview</h3>
        <button class="icon-btn" onclick="closeModal()"><i class="bi bi-x-lg"></i></button></div>
      <div class="modal-body">${poster.innerHTML}</div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-outline" onclick="window.printComboPoster()"><i class="bi bi-printer"></i> Print / PDF</button>
        <button class="btn btn-primary" onclick="window.downloadComboTxt()"><i class="bi bi-download"></i> Download</button>
      </div>`);
  };

  window.printComboPoster = function () {
    document.body.classList.add("printing-combo");
    $("#comboPoster").style.display = "block";
    setTimeout(() => { window.print(); }, 80);
    setTimeout(() => { document.body.classList.remove("printing-combo"); $("#comboPoster").style.display = "none"; }, 400);
  };

  window.downloadComboTxt = function () {
    const s = window.editComboState;
    if (!s) return;
    const text = `SMART COMBO OFFER\n==================\nName: ${s.name}\nProducts: ${s.products.join(", ")}\nMessage: ${s.message}\n`;
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "combo-offer.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  window.whatIsCombo = function () {
    openModal(`
      <div class="modal-header"><h3><i class="bi bi-gift text-primary"></i> How combos are generated</h3>
        <button class="icon-btn" onclick="closeModal()"><i class="bi bi-x-lg"></i></button></div>
      <div class="modal-body">
        <ol class="text-small" style="padding-left:18px;display:grid;gap:8px">
          <li>Frequent itemsets (size ≥ 2) are found using the Apriori / FP-Growth algorithms.</li>
          <li>For each itemset the strongest association rule covering its products is selected.</li>
          <li>Confidence & lift for the bundle come from that rule.</li>
          <li>A descriptive name ("Breakfast Combo", "Daily Hygiene Kit"…) is chosen from the included products.</li>
        </ol>
        <div class="alert alert-info mt-3"><i class="bi bi-lightbulb-fill"></i><div>Every number shown comes straight from your dataset — no guessed values.</div></div>
      </div>`);
  };

  // combo-suggest from basket.js: /combos?combo=... or session
  (function loadSuggest() {
    const s = sessionStorage.getItem("combo-suggest");
    if (s) {
      sessionStorage.removeItem("combo-suggest");
      const parts = JSON.parse(s).flatMap((x) => x.split(" + "));
      const name = parts.length > 1 ? "Custom Rule Combo" : "Custom Combo";
      setTimeout(() => {
        window.customiseCombo ? customiseFromParts(parts, name) : null;
      }, 300);
      function customiseFromParts(products, n) {
        window.editComboState = { products, name: n, message: makePromoMessage(products, n), base: { confidence: "—", lift: "—", support: "—" } };
        renderCustomiseModal(window.editComboState);
      }
    }
  })();

  loadCombos();
})();