/* ==========================================================================
   Upload page — drag & drop uploads with progress, processing checks,
   animated summary tiles, data preview table (search/sort/pagination).
   ========================================================================== */
(function () {
  "use strict";
  const $ = window.qs, $$ = window.qsa;

  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  let previewRows = [];
  let previewState = { q: "", sort: null, asc: true, page: 1, per: 8 };

  function setProgress(pct, pctText) {
    $("#uploadProgress").style.display = "block";
    $("#uploadBar").style.width = pct + "%";
    $("#uploadPct").textContent = pctText + "%";
  }

  function showChecks(checks) {
    const box = $("#uploadChecks");
    box.style.display = "block";
    box.innerHTML = `<div class="d-flex align-center gap-2 mb-2">
      <i class="bi bi-stars text-primary"></i><strong>Processing the file</strong>
    </div>
    ${checks.map((c) => `<div class="quality-row fade-in"><span class="q-icon">${c.icon}</span><div><strong>${c.title}</strong><div class="text-muted text-small">${c.desc}</div></div></div>`).join("")}`;
  }

  function uploadFile(file) {
    if (!file) return;
    const okExt = /\.(csv|xlsx|xls)$/i.test(file.name);
    if (!okExt) {
      toast("error", "Invalid file", "Please choose a .csv or .xlsx file.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    setProgress(4, "4%");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const p = Math.round((e.loaded / e.total) * 60);
        setProgress(p, p + "%");
      }
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        setProgress(100, "100%");
        const d = JSON.parse(xhr.responseText);
        onUploadSuccess(d);
      } else {
        let msg = "Upload failed.";
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) { /* keep */ }
        $("#uploadProgress").style.display = "none";
        toast("error", "Upload failed", msg);
      }
    };
    xhr.onerror = () => {
      $("#uploadProgress").style.display = "none";
      toast("error", "Upload failed", "Network error — is the server running?");
    };
    xhr.send(fd);
  }

  function onUploadSuccess(d) {
    // Processing checks animation
    const steps = [
      { icon: "✅", title: "File validated", desc: d.summary.source },
      { icon: "🧹", title: `Missing values checked`, desc: `${d.summary.removed_records} invalid / duplicate records removed` },
      { icon: "📅", title: "Dates converted", desc: "All dates normalised to YYYY-MM-DD" },
      { icon: "🧮", title: "Total amount calculated", desc: "Amount = Quantity × Price for every row" },
      { icon: "💾", title: "Stored in SQLite", desc: "Transactions, products & customers tables updated" },
    ];
    showChecks(steps);

    setTimeout(() => {
      $("#resultCard").style.display = "block";

      // Summary tiles
      const tiles = [
        { label: "Original Records", value: fmt(d.summary.original_records) },
        { label: "Cleaned Records", value: fmt(d.summary.cleaned_records) },
        { label: "Removed Records", value: fmt(d.summary.removed_records) },
        { label: "Unique Transactions", value: fmt(d.summary.unique_transactions) },
        { label: "Unique Customers", value: fmt(d.summary.unique_customers) },
        { label: "Unique Products", value: fmt(d.summary.unique_products) },
      ];
      $("#summaryTiles").innerHTML = tiles.map((t) => `
        <div class="stat-tile fade-up"><div class="st-label">${t.label}</div>
        <div class="st-value" data-anim="${t.label === 'Removed Records' ? 'false' : 'true'}" data-target="${t.value.replace(/,/g, "")}">0</div></div>`).join("");

      $$("#summaryTiles [data-anim='true']").forEach((el) => {
        const target = parseFloat(el.dataset.target);
        const start = performance.now();
        (function tick(now) {
          const p = Math.min(1, (now - start) / 900);
          const v = Math.round(target * (1 - Math.pow(1 - p, 3)));
          el.textContent = fmt(v);
          if (p < 1) requestAnimationFrame(tick);
        })(performance.now());
      });

      // Quality labels
      $("#qualityChecks").innerHTML = `
        <div class="d-flex gap-2 wrap">
          <span class="badge badge-success"><i class="bi bi-check-circle"></i> Valid rows</span>
          <span class="badge badge-warning"><i class="bi bi-exclamation-triangle"></i> Missing values handled</span>
          <span class="badge badge-success"><i class="bi bi-check-circle"></i> Duplicate check</span>
          <span class="badge badge-success"><i class="bi bi-check-circle"></i> Date validation</span>
          <span class="badge badge-success"><i class="bi bi-check-circle"></i> Ready for analysis</span>
        </div>`;

      previewRows = d.preview || [];
      renderPreview();

      toast("success", "Dataset uploaded", "Dataset processed and ready for analysis.");
      loadDatasetInfo();
    }, 500);
  }

  /* ---------------- preview table ---------------- */
  function renderPreview() {
    let rows = previewRows;
    if (previewState.q) {
      const q = previewState.q.toLowerCase();
      rows = rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(q)));
    }
    if (previewState.sort) {
      const { sort, asc } = previewState;
      rows = [...rows].sort((a, b) => asc ? (a[sort] > b[sort] ? 1 : -1) : (a[sort] < b[sort] ? 1 : -1));
    }
    const pages = Math.max(1, Math.ceil(rows.length / previewState.per));
    previewState.page = Math.min(previewState.page, pages);
    const slice = rows.slice((previewState.page - 1) * previewState.per, previewState.page * previewState.per);

    const cols = ["transaction_id", "customer_id", "date", "product", "quantity", "price", "total_amount", "category"];
    const labels = { transaction_id: "Txn ID", customer_id: "Customer", date: "Date", product: "Product", quantity: "Qty", price: "Price", total_amount: "Amount", category: "Category" };

    if (!slice.length) {
      $("#previewTable").innerHTML = `<div class="empty-state" style="padding:40px"><p>No rows match your search.</p></div>`;
      return;
    }
    $("#previewTable").innerHTML = `
      <table class="table" id="previewTbl">
        <thead><tr>
          ${cols.map((c) => `<th class="sortable" data-col="${c}">${labels[c]} ${previewState.sort === c ? (previewState.asc ? "↑" : "↓") : ""}</th>`).join("")}
        </tr></thead>
        <tbody>${slice.map((r) => `<tr>
          ${cols.map((c) => `<td>${c === "product" ? emojiFor(r[c]) + " " : ""}${esc(r[c] != null ? (typeof r[c] === "number" ? (c === "price" || c === "total_amount" ? fmtMoney(r[c]) : fmt(r[c])) : r[c]) : "")}</td>`).join("")}
        </tr>`).join("")}</tbody>
      </table>
      <div class="pagination" style="padding:12px 16px;border-top:1px solid var(--border)">
        ${pageBtn(1, "‹", previewState.page === 1)}
        ${pageBtn(previewState.page - 1, "‹‹", previewState.page === 1)}
        <span class="page-info">Page ${previewState.page} of ${pages} · ${rows.length} rows</span>
        ${pageBtn(previewState.page + 1, "››", previewState.page >= pages, "next")}
        ${pageBtn(pages, "›", previewState.page >= pages, "last")}
      </div>`;

    $$("#previewTbl th.sortable").forEach((th) => th.addEventListener("click", () => {
      const c = th.dataset.col;
      if (previewState.sort === c) previewState.asc = !previewState.asc;
      else { previewState.sort = c; previewState.asc = true; }
      renderPreview();
    }));
    $$("#previewTable .page-btn").forEach((b) => b.addEventListener("click", () => {
      const delta = parseInt(b.dataset.delta, 10);
      previewState.page = Math.max(1, Math.min(pages, previewState.page + delta));
      renderPreview();
    }));
  }
  function pageBtn(delta, label, disabled) {
    return `<button class="page-btn" data-delta="${delta}" ${disabled ? "disabled" : ""}>${label}</button>`;
  }

  $("#previewSearch").addEventListener("input", (e) => {
    previewState.q = e.target.value;
    previewState.page = 1;
    renderPreview();
  });

  /* ---------------- dataset info box ---------------- */
  function loadDatasetInfo() {
    fetch("/api/dataset-info").then((r) => r.json()).then((d) => {
      const box = $("#datasetInfoBox");
      if (!d.has_data) {
        box.innerHTML = `<div class="empty-state" style="padding:22px"><div class="empty-icon" style="width:54px;height:54px;font-size:24px">📂</div>
          <p>No dataset loaded yet. Upload a file above or load the sample.</p></div>`;
        return;
      }
      box.innerHTML = `
        <div class="kv-grid">
          ${[["Records", fmt(d.records)], ["Transactions", fmt(d.transactions)], ["Products", fmt(d.products)], ["Customers", fmt(d.customers)], ["Categories", fmt(d.category)]].map(([k, v]) =>
            `<div class="kv-item"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("")}
        </div>
        <div class="mt-3">
          <div class="d-flex align-center gap-2"><i class="bi bi-calendar3 text-primary"></i><span class="text-small">Period: <strong>${d.min_date} → ${d.max_date}</strong></span></div>
        </div>
        <div class="d-flex gap-2 mt-3 wrap">
          <button class="btn btn-ghost btn-sm" onclick="window.location.href='/analytics'"><i class="bi bi-graph-up-arrow"></i> Analytics</button>
          <button class="btn btn-outline btn-sm" onclick="window.location.href='/basket-analysis'"><i class="bi bi-link-45deg"></i> Basket Analysis</button>
        </div>`;
    }).catch(() => { /* ignore */ });
  }

  /* ---------------- wiring ---------------- */
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("drag"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
    if (e.dataTransfer.files.length) uploadFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => { if (fileInput.files.length) uploadFile(fileInput.files[0]); });

  $("#sampleBtn").addEventListener("click", () => {
    window.location.href = "/api/download-sample";
  });

  const loadBtn = $("#loadSampleIntoAppBtn");
  loadBtn.addEventListener("click", () => {
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<i class="bi bi-arrow-repeat spinner"></i> Loading…';
    fetch("/api/load-sample", { method: "POST" }).then((r) => r.json()).then((d) => {
      if (!d.ok) { toast("error", "Sample data", d.error || "Failed"); }
      else { onUploadSuccess(d); toast("success", "Sample dataset loaded", `${d.summary.cleaned_records} records analysed.`); }
      loadBtn.disabled = false;
      loadBtn.innerHTML = '<i class="bi bi-box-arrow-in-down"></i> Load Sample into App';
    });
  });

  loadDatasetInfo();
})();