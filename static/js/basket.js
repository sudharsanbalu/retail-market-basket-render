/* ==========================================================================
   Market Basket Analysis Lab — settings sliders, analysis progress,
   stats / insights / scatter / network / rule cards / tables + modals.
   ========================================================================== */
(function () {
  "use strict";
  const $ = window.qs, $$ = window.qsa;

  let result = null;
  let rulesAll = [];
  let rulesView = [];
  let sortKey = "lift";
  let net = null;

  /* ---------------- sliders ---------------- */
  function bindSliders() {
    const pairs = [
      ["minSupport", "suppVal", (v) => (+v).toFixed(3)],
      ["minConfidence", "confVal", (v) => (v * 100).toFixed(0) + "%"],
      ["minLift", "liftVal", (v) => (+v).toFixed(2)],
    ];
    pairs.forEach(([id, valId, fmt]) => {
      const input = document.getElementById(id);
      const out = document.getElementById(valId);
      input.addEventListener("input", () => { out.textContent = fmt(input.value); });
    });
  }

  /* ---------------- run ---------------- */
  function runAnalysis() {
    const backend = {
      min_support: parseFloat($("#minSupport").value),
      min_confidence: parseFloat($("#minConfidence").value),
      min_lift: parseFloat($("#minLift").value),
      algorithm: $("#algorithm").value,
    };

    $("#basketResults").style.display = "none";
    $("#basketError").style.display = "none";
    startProgress();

    fetch("/api/basket-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(backend),
    }).then((r) => r.json()).then((d) => {
      finishProgress();
      if (d.error) {
        showError(d);
        return;
      }
      result = d;
      renderAll(d);
      toast("success", "Analysis complete", `${d.stats.n_rules} rules found from ${d.stats.n_itemsets} itemsets.`);
    }).catch(() => {
      finishProgress();
      toast("error", "Analysis", "Could not reach the analysis engine.");
    });
  }

  const STEPS = [
    ["Preparing transactions…", "Preparing transactions…", "✓ Payments handled"],
    ["Creating basket matrix…", "Creating basket matrix…", "✓ Baskets ready"],
    ["Finding frequent itemsets…", "Finding frequent itemsets…", "✓ Itemsets found"],
    ["Generating association rules…", "Generating association rules…", "✓ Rules generated"],
  ];
  function startProgress() {
    const box = $("#analysisProgress");
    box.style.display = "block";
    $("#analysisBar").style.width = "0%";
    $("#progressTitle").textContent = "Analyzing your dataset";
    $("#analysisSteps").innerHTML = STEPS.map((s, i) =>
      `<div class="seg-step" data-step="${i}"><span class="dot"></span><span>${s[0]}</span></div>`).join("");
    runProgress();
  }
  let progTimers = [];
  function runProgress() {
    progTimers.forEach(clearInterval);
    progTimers = [];
    let step = 0;
    const stepT = setInterval(() => {
      if (step < STEPS.length) {
        const el = $(`#analysisSteps [data-step="${step}"]`);
        if (el) {
          el.classList.add("running");
          el.querySelector(".dot").outerHTML = '<i class="bi bi-circle-fill check" style="color:var(--primary);font-size:8px"></i>';
        }
      }
      step++;
    }, 900);
    progTimers.push(stepT);
    const barT = setInterval(() => {
      const bar = $("#analysisBar");
      if (!bar) return clearInterval(barT);
      const w = parseFloat(bar.style.width || 0);
      if (w < 92) bar.style.width = Math.min(92, w + 6) + "%";
    }, 220);
    progTimers.push(barT);
  }
  function finishProgress() {
    progTimers.forEach(clearInterval);
    progTimers = [];
    const bar = $("#analysisBar"); bar.style.width = "100%";
    $$("#analysisSteps .seg-step").forEach((el, i) => {
      el.classList.remove("running");
      el.classList.add("done");
      if (i < STEPS.length - 1 || true) el.innerHTML = `<i class="bi bi-check-circle-fill check" style="color:var(--success)"></i><span>${STEPS[i][2]}</span>`;
    });
    setTimeout(() => { $("#analysisProgress").style.display = "none"; }, 1200);
  }

  function showError(d) {
    $("#basketError").style.display = "block";
    $("#basketErrorTitle").textContent = d.error || "No association rules found.";
    $("#basketErrorMsg").textContent =
      d.error ? "Adjust the settings on the left and try again." :
      "Try lowering Minimum Support or Confidence — or upload a richer dataset with more transactions.";
  }

  /* ---------------- render all ---------------- */
  function renderAll(d) {
    $("#basketResults").style.display = "block";
    $("#basketEmpty").style.display = "none";
    $("#lastRunLabel").innerHTML = `<i class="bi bi-clock-history"></i> last run: ${d.algorithm} · supp ${d.min_support} · conf ${d.min_confidence} · lift ${d.min_lift}`;
    renderStats(d.stats);
    renderInsights(d.insights || []);
    renderScatter(d.scatter || []);
    renderItemsets(d.itemsets || []);
    rulesAll = d.rules || [];
    rulesView = [...rulesAll];
    renderRulesTable();
    renderRuleCards();
    renderNetwork(d.network);
  }

  function renderStats(s) {
    const tiles = [
      ["Transactions", fmt(s.n_transactions), "bi-receipt", "txn"],
      ["Products", fmt(s.n_products), "bi-box-seam", "items"],
      ["Frequent Itemsets", fmt(s.n_itemsets), "bi-layers", ""],
      ["Association Rules", fmt(s.n_rules), "bi-link-45deg", ""],
      ["Largest Itemset", fmt(s.max_itemset_size), "bi-box", "items"],
      ["Sample Baskets", "1 · 0 · 1", "bi-list-check", "encoded"],
    ];
    const boxes = document.getElementById("basketStats");
    boxes.innerHTML = tiles.map(([l, v, ic, u]) => `
      <div class="stat-tile fade-up"><div class="kpi-icon" style="margin:0 auto 8px;width:38px;height:38px;font-size:17px"><i class="bi ${ic}"></i></div>
      <div class="st-value">${v}</div><div class="st-label">${l}${u ? " · " + u : ""}</div></div>`).join("");
    // replace the pseudo Sample Baskets with a truthful metric
    boxes.querySelectorAll(".stat-tile")[5].innerHTML =
      `<div class="kpi-icon" style="margin:0 auto 8px;width:38px;height:38px;font-size:17px"><i class="bi bi-list-check"></i></div>
       <div class="st-value">${s.n_transactions}</div><div class="st-label">Baskets · one-hot</div>
       <div class="st-label text-muted">Transformation using Pandas</div>`;
  }

  function renderInsights(insights) {
    const el = $("#basketInsights");
    if (!insights || !insights.length) { el.innerHTML = `<div class="text-muted text-small">No extra insights computed.</div>`; return; }
    el.innerHTML = `<div class="insight-list">${insights.slice(0, 5).map((i) =>
      `<div class="insight-item"><i class="bi bi-lightbulb-fill bulb"></i><span>${esc(i)}</span></div>`).join("")}</div>`;
  }

  function renderScatter(points) {
    if (!points.length) return;
    createScatter("scatterChart", points);
  }

  function renderItemsets(itemsets) {
    $("#itemsetCount").textContent = `${itemsets.length} itemsets`;
    const tbody = $("#itemsetsTable tbody");
    tbody.innerHTML = itemsets.slice(0, 200).map((r) => `
      <tr>
        <td class="text-muted">${r.id}</td>
        <td>${r.items.map((i) => `<span class="chip" style="padding:3px 9px;margin-right:4px">${emojiFor(i)} ${esc(i)}</span>`).join("")}</td>
        <td class="num"><span class="badge badge-flat">${r.size}</span></td>
        <td class="num"><strong>${(r.support * 100).toFixed(2)}%</strong></td>
        <td class="num">${fmt(r.transactions)}</td>
      </tr>`).join("") +
      (itemsets.length > 200 ? `<tr><td colspan="5" class="text-muted text-small">Showing first 200 itemsets…</td></tr>` : "");
  }

  /* ---------------- rules table + sort/filter ---------------- */
  function applyRuleFilter() {
    const q = $("#rulesSearch").value.trim().toLowerCase();
    let rows = rulesAll;
    if (q) rows = rows.filter((r) =>
      (r.antecedent_str + " " + r.consequent_str).toLowerCase().includes(q));
    rows = [...rows].sort((a, b) => b[sortKey] - a[sortKey]);
    const limit = $("#rulesLimit").value === "All" ? rows.length : parseInt($("#rulesLimit").value, 10);
    rulesView = rows.slice(0, limit);
  }

  function renderRulesTable() {
    $("#ruleCount").textContent = `${rulesAll.length} rules`;
    applyRuleFilter();
    const tbody = $("#rulesTable tbody");
    if (!rulesView.length) { tbody.innerHTML = `<tr><td colspan="7" class="text-muted text-small">No rules match your filter.</td></tr>`; return; }
    tbody.innerHTML = rulesView.map((r) => `
      <tr style="cursor:pointer" onclick="window.viewRule(${r.id})">
        <td>${r.antecedent.map((a) => `${emojiFor(a)} ${esc(a)}`).join(" + ")}</td>
        <td class="text-primary"><i class="bi bi-arrow-right"></i></td>
        <td>${r.consequent.map((c) => `${emojiFor(c)} ${esc(c)}`).join(" + ")}</td>
        <td class="num">${(r.support * 100).toFixed(2)}%</td>
        <td class="num">${(r.confidence * 100).toFixed(1)}%</td>
        <td class="num"><span class="badge ${r.lift >= 1.5 ? "badge-success" : "badge-primary"}">${r.lift.toFixed(2)}</span></td>
        <td class="num">${fmt(r.transactions)}</td>
      </tr>`).join("");
  }

  $("#rulesSearch").addEventListener("input", () => renderRulesTable());
  $("#rulesLimit").addEventListener("change", () => renderRulesTable());
  $$("#ruleSort button").forEach((b) => b.addEventListener("click", () => {
    $$("#ruleSort button").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    sortKey = b.dataset.sort;
    renderRulesTable();
    renderRuleCards();
  }));

  /* ---------------- rule cards ---------------- */
  function renderRuleCards() {
    const cards = [...rulesAll].sort((a, b) => b[sortKey] - a[sortKey]).slice(0, 12);
    const grid = $("#ruleCards");
    if (!cards.length) { grid.innerHTML = `<div class="card" style="grid-column:1/-1"><div class="card-body text-muted text-small">No rules to display.</div></div>`; return; }
    grid.innerHTML = cards.map((r) => `
      <div class="rule-card fade-up">
        <div class="rule-link">
          <span class="rule-chip-item">${emojiFor(r.antecedent[0])} ${esc(r.antecedent_str)}</span>
          <span class="arr">→</span>
          <span class="rule-chip-item">${emojiFor(r.consequent[0])} ${esc(r.consequent_str)}</span>
        </div>
        <div class="stats-row">
          <div class="stat-3"><div class="v">${(r.support * 100).toFixed(1)}%</div><div class="l">Support</div></div>
          <div class="stat-3"><div class="v">${(r.confidence * 100).toFixed(1)}%</div><div class="l">Confidence</div></div>
          <div class="stat-3"><div class="v">${r.lift.toFixed(2)}</div><div class="l">Lift</div></div>
        </div>
        <div class="card-actions">
          <button class="btn btn-outline btn-sm" onclick="window.viewRule(${r.id})"><i class="bi bi-eye"></i> View Details</button>
          <button class="btn btn-ghost btn-sm" onclick="window.useRuleForCombo('${esc(r.antecedent_str)}','${esc(r.consequent_str)}')"><i class="bi bi-gift"></i> Use for Combo</button>
        </div>
      </div>`).join("");
  }

  window.viewRule = function (id) {
    const r = rulesAll.find((x) => x.id === id);
    if (!r) return;
    openModal(`
      <div class="modal-header"><h3><i class="bi bi-link-45deg text-primary"></i> Rule Details</h3>
        <button class="icon-btn" onclick="closeModal()"><i class="bi bi-x-lg"></i></button></div>
      <div class="modal-body">
        <div class="rule-link" style="font-size:17px">
          <span class="rule-chip-item">${emojiFor(r.antecedent[0])} ${esc(r.antecedent_str)}</span>
          <span class="arr">→</span>
          <span class="rule-chip-item">${emojiFor(r.consequent[0])} ${esc(r.consequent_str)}</span>
        </div>
        <div class="combo-metrics mb-3" style="grid-template-columns:repeat(3,1fr)">
          <div class="combo-metric"><div class="v">${(r.support * 100).toFixed(2)}%</div><div class="l">Support</div></div>
          <div class="combo-metric"><div class="v">${(r.confidence * 100).toFixed(1)}%</div><div class="l">Confidence</div></div>
          <div class="combo-metric"><div class="v">${r.lift.toFixed(2)}</div><div class="l">Lift</div></div>
        </div>
        <div class="kv-grid" style="grid-template-columns:repeat(2,1fr)">
          <div class="kv-item"><div class="k">Transactions</div><div class="v">${fmt(r.transactions)}</div></div>
          <div class="kv-item"><div class="k">Antecedent</div><div class="v" style="font-size:13px">${esc(r.antecedent_str)}</div></div>
          <div class="kv-item"><div class="k">Consequent</div><div class="v" style="font-size:13px">${esc(r.consequent_str)}</div></div>
          <div class="kv-item"><div class="k">Interpretation</div><div class="v" style="font-size:12px">
            ${r.lift > 1 ? "Lift > 1 — association is stronger than random." : r.lift === 1 ? "Lift ≈ 1 — independent products." : "Lift < 1 — negative association."}
          </div></div>
        </div>
        <div class="alert alert-info mt-3">
          <i class="bi bi-lightbulb-fill"></i>
          <div><strong>Why it matters</strong><br>In <strong>${(r.support * 100).toFixed(1)}%</strong> of baskets these products appear together.
          Whenever a shopper buys <strong>${esc(r.antecedent_str)}</strong>, they buy <strong>${esc(r.consequent_str)}</strong> in
          <strong>${(r.confidence * 100).toFixed(1)}%</strong> of cases — ${r.lift > 1 ? "a genuine, lift-driven purchasing pattern." : "similar to random chance."}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="window.useRuleForCombo('${esc(r.antecedent_str)}','${esc(r.consequent_str)}')">
          <i class="bi bi-gift"></i> Create Combo from Rule</button>
      </div>`);
  };

  window.useRuleForCombo = function (a, c) {
    closeModal();
    sessionStorage.setItem("combo-suggest", JSON.stringify([a, c].filter(Boolean)));
    window.location.href = "/combos";
  };

  /* ---------------- NETWORK VISUALISATION ---------------- */
  function renderNetwork(networkData) {
    const nState = new Network("#networkSvg", "#networkWrap");
    net = nState;
    nState.minLift = 1.0;
    nState.data = networkData;
    const filt = $("#netLiftFilter");
    filt.value = 1.5;
    nState.render(filt.value);
    filt.addEventListener("input", () => { nState.render(parseFloat(filt.value)); });
  }

  function Network(sel, wrapSel) {
    const svg = $(sel);
    const wrap = $(wrapSel);
    let layer;
    let nodesMap = {}, edgesList = [];
    let nodes = [];
    let transform = { x: 0, y: 0, k: 1 };
    let simRun = false;

    function setup() {
      svg.innerHTML = "";
      const w = wrap.clientWidth, h = wrap.clientHeight;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
      svg.appendChild(layer);
      // background rect for pan
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("width", w); bg.setAttribute("height", h);
      bg.setAttribute("fill", "transparent");
      layer.appendChild(bg);
    }

    function build(minLift) {
      const d = this.data || { nodes: [], edges: [] };
      edgesList = (d.edges || []).filter((e) => e.lift >= minLift);
      const ids = new Set(edgesList.flatMap((e) => [e.source, e.target]));
      nodes = (d.nodes || []).filter((n) => ids.has(n.id));
      // assign positions (circular layout seed)
      const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
      const R = Math.min(cx, cy) - 60;
      nodes.forEach((n, i) => {
        const ang = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
        n.x = cx + R * Math.cos(ang) + (Math.random() - 0.5) * 60;
        n.y = cy + R * Math.sin(ang) + (Math.random() - 0.5) * 60;
        n.vx = 0; n.vy = 0;
      });
      nodesMap = {};
      nodes.forEach((n) => (nodesMap[n.id] = n));
    }

    function physics(iterations) {
      const k = 1.15;          // repulsion constant
      const cx = wrap.clientWidth / 2, cy = wrap.clientHeight / 2;
      const centerForce = 0.012;
      for (let it = 0; it < iterations; it++) {
        // repulsion
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j];
            let dx = a.x - b.x, dy = a.y - b.y;
            let d2 = dx * dx + dy * dy || 1;
            const d = Math.sqrt(d2);
            const f = k * k / d2;
            dx /= d; dy /= d;
            a.vx += dx * f; a.vy += dy * f;
            b.vx -= dx * f; b.vy -= dy * f;
          }
        }
        // springs
        for (const e of edgesList) {
          const a = nodesMap[e.source], b = nodesMap[e.target];
          if (!a || !b) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const target = 120 - e.lift * 8;
          const f = 0.02 * (d - target);
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
        // center gravity + dampening
        for (const n of nodes) {
          n.vx += (cx - n.x) * centerForce;
          n.vy += (cy - n.y) * centerForce;
          n.vx *= 0.82; n.vy *= 0.82;
          n.x += n.vx; n.y += n.vy;
        }
      }
    }

    function render(minLift) {
      build.call(this, minLift);
      // run physics asynchronously in frames so UI stays responsive
      let step = 0;
      const totalSteps = 40;
      const onFrame = () => {
        if (step++ < totalSteps) {
          physics(8);
          drawFrame();
          requestAnimationFrame(onFrame);
        } else {
          drawFrame();
          simRun = false;
        }
      };
      if (!simRun) { simRun = true; requestAnimationFrame(onFrame); }
    }

    let hoverNode = null, dragNode = null, panStart = null;

    function colorFor(lift) {
      const t = Math.min(1, Math.max(0, (lift - 1) / 4));
      // interpolate primary #ea580c -> accent #fbbf24
      const r = Math.round(234 + (251 - 234) * t);
      const g = Math.round(88 + (191 - 88) * t);
      const b = Math.round(12 + (36 - 12) * t);
      return `rgb(${r},${g},${b})`;
    }

    function drawFrame() {
      layer.innerHTML = "";
      // background (pan layer) still needed
      const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("width", wrap.clientWidth); bg.setAttribute("height", wrap.clientHeight);
      bg.setAttribute("fill", "transparent");
      layer.appendChild(bg);

      // edges
      for (const e of edgesList) {
        const a = nodesMap[e.source], b = nodesMap[e.target];
        if (!a || !b) continue;
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
        line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
        const active = hoverNode && (e.source === hoverNode.id || e.target === hoverNode.id);
        line.setAttribute("stroke", active ? "var(--primary)" : "var(--border-2)");
        line.setAttribute("stroke-width", active ? 3 : Math.max(1, e.lift * 0.9));
        line.setAttribute("opacity", active ? 1 : e.lift > 2 ? 0.75 : 0.5);
        line.setAttribute("data-kind", "edge");
        line.setAttribute("class", "net-edge");
        const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
        title.textContent = `${e.source} → ${e.target}  lift ${e.lift.toFixed(2)}`;
        line.appendChild(title);
        layer.appendChild(line);
      }

      // nodes
      for (const n of nodes) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.setAttribute("data-node", n.id);
        g.setAttribute("class", "net-node");
        const over = hoverNode === n || dragNode === n;
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("r", over ? 28 : 22);
        circle.setAttribute("fill", colorFor(n.lift));
        circle.setAttribute("stroke", over ? "var(--text)" : "var(--surface)");
        circle.setAttribute("stroke-width", 3);
        circle.setAttribute("style", "cursor:pointer;filter:drop-shadow(0 4px 10px rgba(234,88,12,.35))");
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", 0); text.setAttribute("y", 4);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("fill", "var(--text)");
        text.setAttribute("style", "font:700 12px 'Inter',sans-serif;cursor:pointer;pointer-events:none");
        text.textContent = shorten(n.id, 16);
        g.appendChild(circle);
        g.appendChild(text);
        g.setAttribute("transform", `translate(${n.x},${n.y})`);
        g.dataset.lift = n.lift.toFixed(2);
        g.dataset.conf = (n.confidence * 100).toFixed(1);
        layer.appendChild(g);
      }
    }

    // interactions
    function nodeFromEvent(evt) {
      const el = evt.target.closest?.("[data-node]");
      return el ? nodes.find((n) => n.id === el.dataset.node) : null;
    }

    svg.addEventListener("pointerdown", (evt) => {
      const node = nodeFromEvent(evt);
      if (node) {
        dragNode = node;
        node.px = evt.offsetX; node.py = evt.offsetY;
        svg.setPointerCapture(evt.pointerId);
      } else {
        panStart = { x: evt.clientX, y: evt.clientY };
        svg.setPointerCapture(evt.pointerId);
      }
    });

    svg.addEventListener("pointermove", (evt) => {
      if (dragNode) {
        const nx = dragNode.x + (evt.offsetX - dragNode.px);
        const ny = dragNode.y + (evt.offsetY - dragNode.py);
        dragNode.x = nx; dragNode.y = ny;
        dragNode.px = evt.offsetX; dragNode.py = evt.offsetY;
        drawFrame();
      } else if (panStart) {
        const dx = evt.clientX - panStart.x;
        const dy = evt.clientY - panStart.y;
        panStart = { x: evt.clientX, y: evt.clientY };
        nodes.forEach((n) => { n.x += dx; n.y += dy; });
        drawFrame();
      } else {
        const node = nodeFromEvent(evt);
        if (node !== hoverNode) { hoverNode = node; drawFrame(); }
        const tip = $("#netTooltip");
        if (node) {
          tip.style.display = "block";
          tip.style.left = evt.offsetX + 14 + "px";
          tip.style.top = evt.offsetY + 14 + "px";
          tip.innerHTML = `<strong>${esc(node.id)}</strong><br>buyer affinity · lift ${node.lift.toFixed(2)}`;
        } else tip.style.display = "none";
      }
    });

    svg.addEventListener("pointerup", (evt) => {
      const wasDrag = !!dragNode;
      const clickedNode = dragNode;
      dragNode = null; panStart = null;
      try { svg.releasePointerCapture(evt.pointerId); } catch (e) { /* ignore */ }
      if (wasDrag && clickedNode) {
        // treat as click unless moved far — simple: always open
        openNodeDetails(clickedNode.id);
      }
    });

    svg.addEventListener("wheel", (evt) => {
      evt.preventDefault();
      const factor = evt.deltaY < 0 ? 1.12 : 0.89;
      const rect = svg.getBoundingClientRect();
      const mx = evt.clientX - rect.left, my = evt.clientY - rect.top;
      nodes.forEach((n) => {
        n.x = mx + (n.x - mx) * factor;
        n.y = my + (n.y - my) * factor;
      });
      drawFrame();
    }, { passive: false });

    function openNodeDetails(id) {
      // find edges connected to this product
      const related = edgesList.filter((e) => e.source === id || e.target === id)
        .map((e) => (e.source === id ? e.target : e.source));
      // fetch real recommendations
      fetch(`/api/recommendations/${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => {
        const recs = d.recommendations || [];
        const list = recs.length ? recs.map((r, i) => `
          <div class="d-flex align-center justify-between" style="padding:9px 2px;border-bottom:1px dashed var(--border)">
            <div class="d-flex align-center gap-2"><span class="badge badge-primary">${i + 1}</span>
            <strong>${emojiFor(r.product)} ${esc(r.product)}</strong></div>
            <span class="badge badge-accent">lift ${r.lift}</span></div>`).join("") :
          `<div class="text-muted text-small">No strong rules found for this product with the current thresholds.</div>`;
        openDrawer(`Products frequently purchased with ${id}`,
          `<div class="alert alert-info mb-3"><i class="bi bi-lightbulb-fill"></i><div>Clicking this product on the network shows only real
           purchase patterns mined from your dataset.</div></div>
           <div style="margin-bottom:12px"><span class="badge badge-flat">${related.slice(0, 12).map((x) => emojiFor(x) + " " + esc(x)).join(" · ")}</span></div>
           <h4 class="fw-700 mb-2" style="font-size:14px">Top recommendations</h4>${list}`,
          `<button class="btn btn-outline btn-sm" onclick="window.location.href='/recommendations?product=${encodeURIComponent(id)}'">
            <i class="bi bi-lightbulb"></i> Open Recommendation Page</button>`);
      }).catch(() => toast("error", "Network", "Could not load product details."));
    }

    function shorten(s, n) { return s.length > n ? s.slice(0, n - 1) + "…" : s; }

    this.setup = setup;
    this.build = build;
    this.render = render;
    this.drawFrame = drawFrame;
    setup();
    return this;
  }

  /* ---------------- helpers / extras ---------------- */
  window.applyRelaxedSettings = function () {
    $("#minSupport").value = 0.005;
    $("#minConfidence").value = 0.15;
    $("#minLift").value = 1.0;
    bindSliders();
    $("#suppVal").textContent = "0.005";
    $("#confVal").textContent = "15%";
    $("#liftVal").textContent = "1.00";
    runAnalysis();
  };

  window.openBasketHelp = function () {
    openModal(`
      <div class="modal-header"><h3><i class="bi bi-question-circle text-primary"></i> How Market Basket Analysis Works</h3>
        <button class="icon-btn" onclick="closeModal()"><i class="bi bi-x-lg"></i></button></div>
      <div class="modal-body">
        <p class="text-muted mb-3">This project applies <strong>association rule mining</strong> to your retail transactions using the Apriori / FP-Growth algorithms.</p>
        ${[["1-circle", "Build baskets", "Each transaction is converted into a set of products (a 'basket'). E.g. T001 → {Bread, Milk, Butter}."],
            ["2-circle", "Frequent itemsets", "Apriori counts how often each product combination appears. Combinations above Minimum Support become frequent itemsets."],
            ["3-circle", "Generate rules", "Each frequent itemset is split into Antecedent → Consequent candidates, e.g. Bread → Milk."],
            ["4-circle", "Filter by Confidence & Lift", "Only rules with confidence above your threshold and lift above your threshold are kept."],
            ["5-circle", "Use the results", "The strongest rules power product recommendations and smart combo offers elsewhere in the app."]].map(([ic, t, d]) =>
            `<div style="display:flex;gap:12px;margin-bottom:14px"><div class="kpi-icon" style="width:34px;height:34px;font-size:14px"><i class="bi bi-${ic}" style="font-size:16px"></i></div>
             <div><strong>${t}</strong><div class="text-muted text-small">${d}</div></div></div>`).join("")}
      </div>`);
  };

  $("#runAnalysisBtn2").addEventListener("click", runAnalysis);
  bindSliders();
})();