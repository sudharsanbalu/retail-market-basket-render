/* ==========================================================================
   Core application shell — theme, sidebar, command palette, toasts,
   modals / drawers, global search, presentation mode, helpers.
   ========================================================================== */
(function () {
  "use strict";

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------------------------------------------------------------
     THEME
  --------------------------------------------------------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
    const icon = $("#themeIcon");
    if (icon) icon.className = theme === "dark" ? "bi bi-sun-fill" : "bi bi-moon-stars";
    document.dispatchEvent(new CustomEvent("themechange", { detail: theme }));
  }

  function initTheme() {
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
  }

  /* ---------------------------------------------------------------
     SIDEBAR (collapse persisted + mobile drawer)
  --------------------------------------------------------------- */
  function initSidebar() {
    const sidebar = $("#sidebar");
    const mainWrap = $(".main-wrap");
    if (!sidebar) return;

    $("#sidebarToggle").addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      document.body.classList.toggle("sidebar-collapsed", sidebar.classList.contains("collapsed"));
      localStorage.setItem("sidebar-collapsed", sidebar.classList.contains("collapsed") ? "1" : "0");
      window.dispatchEvent(new Event("resize"));
    });

    if (localStorage.getItem("sidebar-collapsed") === "1" && window.innerWidth > 768) {
      sidebar.classList.add("collapsed");
      document.body.classList.add("sidebar-collapsed");
    }

    // Mobile toggle
    const mobileBtn = $("#mobileMenuBtn");
    if (mobileBtn) {
      mobileBtn.style.display = "grid";
      mobileBtn.addEventListener("click", () => {
        sidebar.classList.add("mobile-open");
        $("#sideMask").classList.add("show");
      });
    }
    $("#sideMask").addEventListener("click", closeMobileSidebar);
    function closeMobileSidebar() {
      sidebar.classList.remove("mobile-open");
      $("#sideMask").classList.remove("show");
    }
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMobileSidebar();
    });

    // Active nav highlight
    const page = window.APP.page;
    $$("[data-nav]").forEach((el) => el.classList.toggle("active", el.dataset.nav === page));
  }

  /* ---------------------------------------------------------------
     TOASTS
  --------------------------------------------------------------- */
  window.toast = function (type, title, msg, ms = 4200) {
    const icons = {
      success: "bi-check-circle-fill", error: "bi-x-octagon-fill",
      warning: "bi-exclamation-triangle-fill", info: "bi-info-circle-fill",
    };
    const stack = $("#toastStack");
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.innerHTML = `<i class="bi ${icons[type]}"></i>
      <div class="toast-body"><div class="toast-title">${title}</div>
      <div class="toast-msg">${msg}</div></div>
      <button class="toast-x" aria-label="Dismiss">✕</button>`;
    stack.appendChild(t);
    t.querySelector(".toast-x").addEventListener("click", () => dismiss(t));
    setTimeout(() => dismiss(t), ms);
    function dismiss(el) {
      if (!el.isConnected) return;
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 260);
    }
  };

  /* ---------------------------------------------------------------
     MODAL
  --------------------------------------------------------------- */
  const modalBackdrop = $("#modalBackdrop");
  const modalBox = $("#modalBox");

  window.openModal = function (html, opts = {}) {
    modalBox.innerHTML = html;
    modalBackdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    if (opts.onOpen) opts.onOpen();
  };

  window.closeModal = function () {
    modalBackdrop.classList.remove("open");
    document.body.style.overflow = "";
  };

  modalBackdrop.addEventListener("click", (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); closeDrawer(); }
  });

  /* ---------------------------------------------------------------
     DRAWER
  --------------------------------------------------------------- */
  const drawer = $("#drawer");
  const drawerBackdrop = $("#drawerBackdrop");

  window.openDrawer = function (title, bodyHtml, footerHtml = "") {
    $("#drawerTitle").textContent = title;
    $("#drawerBody").innerHTML = bodyHtml;
    $("#drawerFooter").innerHTML = footerHtml;
    drawer.classList.add("open");
    drawerBackdrop.style.opacity = 1;
    drawerBackdrop.style.pointerEvents = "auto";
    document.body.style.overflow = "hidden";
  };

  window.closeDrawer = function () {
    drawer.classList.remove("open");
    drawerBackdrop.style.opacity = 0;
    drawerBackdrop.style.pointerEvents = "none";
    document.body.style.overflow = "";
  };
  drawerBackdrop.addEventListener("click", closeDrawer);

  /* ---------------------------------------------------------------
     PRESENTATION MODE
  --------------------------------------------------------------- */
  function initPresentation() {
    $("#presentBtn").addEventListener("click", () => {
      const active = document.body.classList.toggle("presentation");
      if (active && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      if (!active && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      toast("info", "Presentation Mode", active ? "Sidebar hidden · layout expanded" : "Presentation mode off");
      setTimeout(() => window.dispatchEvent(new Event("resize")), 100);
    });
  }

  /* ---------------------------------------------------------------
     COMMAND PALETTE + GLOBAL SEARCH
  --------------------------------------------------------------- */
  const navItems = [
    { icon: "bi-grid-1x2-fill", label: "Dashboard", url: "/dashboard", action: true },
    { icon: "bi-cloud-arrow-up-fill", label: "Upload Dataset", url: "/upload", action: true },
    { icon: "bi-graph-up-arrow", label: "Sales Analytics", url: "/analytics", action: true },
    { icon: "bi-link-45deg", label: "Market Basket Analysis", url: "/basket-analysis", action: true },
    { icon: "bi-lightbulb-fill", label: "Product Recommendations", url: "/recommendations", action: true },
    { icon: "bi-gift-fill", label: "Combo Generator", url: "/combos", action: true },
    { icon: "bi-people-fill", label: "Customers", url: "/customers", action: true },
    { icon: "bi-box-seam-fill", label: "Products", url: "/products", action: true },
    { icon: "bi-file-earmark-text-fill", label: "Reports", url: "/reports", action: true },
    { icon: "bi-info-circle-fill", label: "About Project", url: "/about", action: true },
    { icon: "bi-moon-stars", label: "Toggle Dark / Light Mode", url: null, run: () => {
      document.documentElement.getAttribute("data-theme") === "dark" ? applyTheme("light") : applyTheme("dark");
      toast("info", "Theme", "Theme updated");
    }},
    { icon: "bi-presentation", label: "Presentation Mode", url: null, run: () => $("#presentBtn").click() },
  ];

  const cmdBackdrop = $("#cmdBackdrop");
  const cmdInput = $("#cmdInput");
  const cmdList = $("#cmdList");
  const globalInput = $("#globalSearchInput");
  const globalResults = $("#globalSearchResults");
  let cmdSelected = 0;
  let cmdResults = [];

  function debounce(fn, ms = 280) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  function openCmd() { cmdBackdrop.classList.add("open"); setTimeout(() => cmdInput.focus(), 60); cmdList.innerHTML = ""; cmdResults = []; cmdSelected = 0; }
  function closeCmd() { cmdBackdrop.classList.remove("open"); }

  function cmdRender() { /* placeholder: overridden when search results arrive */ }

  function runCmdSearch(q) {
    if (!q.trim()) { showNavOnly(); return; }
    fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(data => {
      cmdResults = [];
      const groups = [];
      if (data.products?.length) groups.push({
        label: "Products",
        items: data.products.map(p => ({
          icon: "bi-box-seam", text: p.name,
          sub: `${p.transactions} txns · ₹${fmt(p.revenue)}`,
          url: `/products?focus=${encodeURIComponent(p.name)}`, action: true,
        })),
      });
      if (data.rules?.length) groups.push({
        label: "Association Rules",
        items: data.rules.map(r => ({
          icon: "bi-link-45deg",
          text: `${r.antecedent} → ${r.consequent}`,
          sub: `lift ${r.lift} · conf ${(r.confidence * 100).toFixed(1)}%`,
          url: "/basket-analysis", action: true,
        })),
      });
      if (data.customers?.length) groups.push({
        label: "Customers",
        items: data.customers.map(c => ({
          icon: "bi-person", text: c, sub: "Click to view", url: "/customers", action: true,
        })),
      });
      if (data.transactions?.length) groups.push({
        label: "Transactions",
        items: data.transactions.map(t => ({
          icon: "bi-receipt",
          text: `${t.transaction_id} · ${t.product || ""}`,
          sub: `${t.customer_id} · ${t.date}`, url: "/analytics", action: true,
        })),
      });
      cmdResults = groups;
      cmdSelected = 0;
      renderCmdGroups(groups, q);
    }).catch(() => renderCmdGroups([], q));
  }

  function showNavOnly() {
    cmdResults = [{ label: "Quick Actions", items: navItems.filter(n => n.action).map(n => ({
      icon: n.icon, text: n.label, url: n.url, action: true })) }];
    cmdSelected = 0;
    renderCmdGroups(cmdResults, "");
  }

  function renderCmdGroups(groups, q) {
    if (!q.trim()) showNavOnly();
    if (!groups.length && q.trim()) {
      cmdList.innerHTML = `<div class="cmd-item" style="justify-content:center;color:var(--muted)">No results for “${q}”</div>`;
      return;
    }
    if (!groups.length) return;
    let html = "";
    groups.forEach(g => {
      html += `<div class="cmd-group-label">${g.label}</div>`;
      g.items.forEach(it => {
        html += `<div class="cmd-item" data-idx="${cmdResults.flatMap(g => g.items).indexOf(it)}">
          <i class="bi ${it.icon}"></i><span>${it.text}</span>
          ${it.sub ? `<small class="text-muted">${it.sub}</small>` : ""}
        </div>`;
      });
    });
    cmdList.innerHTML = html;
    markSelected();
  }

  function markSelected() {
    const all = $$(".cmd-item", cmdList);
    all.forEach((el, i) => el.classList.toggle("selected", i === cmdSelected));
    all[cmdSelected]?.scrollIntoView({ block: "nearest" });
  }

  function cmdEnter() {
    const flat = cmdResults.flatMap(g => g.items);
    const item = flat[cmdSelected];
    if (!item) return;
    closeCmd();
    if (item.url) location.href = item.url;
    else if (item.run) item.run();
  }

  document.addEventListener("keydown", function (e) {
    // Ctrl+K / Cmd+K
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      cmdBackdrop.classList.contains("open") ? closeCmd() : openCmd();
    }
    if (!cmdBackdrop.classList.contains("open")) return;
    if (e.key === "Escape") closeCmd();
    if (e.key === "ArrowDown") { e.preventDefault(); cmdSelected = Math.min(cmdSelected + 1, cmdResults.flatMap(g => g.items).length - 1); markSelected(); }
    if (e.key === "ArrowUp") { e.preventDefault(); cmdSelected = Math.max(cmdSelected - 1, 0); markSelected(); }
    if (e.key === "Enter") { e.preventDefault(); cmdEnter(); }
  });

  cmdInput.addEventListener("input", debounce(() => runCmdSearch(cmdInput.value), 240));
  cmdList.addEventListener("click", (e) => {
    const item = e.target.closest(".cmd-item");
    if (!item) return;
    cmdSelected = parseInt(item.dataset.idx, 10);
    cmdEnter();
  });
  cmdBackdrop.addEventListener("click", (e) => { if (e.target === cmdBackdrop) closeCmd(); });
  // open palette from the visible magnifier too
  $(".global-search .bi-search")?.addEventListener("click", openCmd);

  /* ---------------- topbar live search ---------------- */
  let searchOpen = false;
  function renderGlobalResults(data, q) {
    if (!q.trim()) { globalResults.style.display = "none"; return; }
    let html = "";
    const add = (label, icon, itemHtml) => {
      if (!itemHtml) return;
      html += `<div class="search-result-group">${label}</div>${itemHtml}`;
    };
    add("Products", "bi-box-seam", (data.products || []).slice(0, 4).map(p =>
      `<a class="search-result-item" href="/products?focus=${encodeURIComponent(p.name)}">
        <i class="bi bi-box-seam"></i><div><strong>${p.name}</strong>
        <small class="text-muted" style="display:block">${p.transactions} txns · ₹${fmt(p.revenue)}</small></div></a>`).join(""));
    add("Association Rules", "bi-link-45deg", (data.rules || []).slice(0, 3).map(r =>
      `<a class="search-result-item" href="/basket-analysis">
        <i class="bi bi-link-45deg"></i><div><strong>${r.antecedent} → ${r.consequent}</strong>
        <small class="text-muted" style="display:block">lift ${r.lift}</small></div></a>`).join(""));
    add("Customers", "bi-person", (data.customers || []).slice(0, 3).map(c =>
      `<a class="search-result-item" href="/customers"><i class="bi bi-person"></i>
       <div><strong>${c}</strong></div></a>`).join(""));
    if (!html) html = `<div class="search-result-group">No results</div>`;
    globalResults.innerHTML = html;
    globalResults.style.display = "block";
    searchOpen = true;
  }

  globalInput.addEventListener("input", debounce(function () {
    const q = globalInput.value;
    if (!q.trim()) { globalResults.style.display = "none"; searchOpen = false; return; }
    fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json())
      .then(d => renderGlobalResults(d, q)).catch(() => {});
  }, 280));

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#globalSearchWrap")) { globalResults.style.display = "none"; searchOpen = false; }
  });

  /* ---------------------------------------------------------------
     COMMON HELPERS
  --------------------------------------------------------------- */
  window.fmt = function (n) {
    if (n === null || n === undefined) return "—";
    return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };
  window.fmtMoney = function (n) {
    if (n === null || n === undefined) return "—";
    return "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };
  window.esc = function (s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  };
  window.toast = window.toast; // already exposed

  window.emojiFor = function (name) {
    const map = {
      "milk": "🥛", "bread": "🍞", "butter": "🧈", "eggs": "🥚", "curd": "🍦", "cheese": "🧀",
      "biscuits": "🍪", "chips": "🥔", "chocolate": "🍫", "cookies": "🍪",
      "coffee": "☕", "tea": "🍵", "juice": "🧃", "sugar": "🍬", "salt": "🧂",
      "rice": "🍚", "dal": "🫘", "cooking oil": "🛢️", "shampoo": "🧴", "soap": "🧼",
      "toothpaste": "🪥", "paneer": "🧀", "buns": "🥐", "cake": "🍰",
    };
    if (!name) return "🛍️";
    const key = Object.keys(map).find(k => String(name).toLowerCase().includes(k));
    return key ? map[key] : "📦";
  };

  // Skeleton helpers
  window.skeletonHTML = function (lines = 5) {
    let h = "";
    for (let i = 0; i < lines; i++) h += `<div class="skeleton skeleton-line ${i % 2 ? "short" : ""}"></div>`;
    return `<div class="skeleton-card">${h}</div>`;
  };

  /* ---------------------------------------------------------------
     MISC INIT
  --------------------------------------------------------------- */
  function initMisc() {
    $("#themeToggle").addEventListener("click", () => {
      applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    });

    // Scroll to top
    window.addEventListener("scroll", () => {
      $("#toTop").classList.toggle("show", window.scrollY > 500);
    });
    $("#toTop").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

    // Mobile menu button visibility
    if (window.innerWidth <= 768) $("#mobileMenuBtn").style.display = "grid";

    // data-action delegated links (e.g. custom quick actions)
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-action]");
      if (!el) return;
      const fn = window[el.dataset.action];
      if (typeof fn === "function") fn.call(el, e);
    });
  }

  // Expose page helpers
  window.qs = (s, r) => (r || document).querySelector(s);
  window.qsa = (s, r) => Array.from((r || document).querySelectorAll(s));
  window.onScriptLoad = function (fn) { if (document.readyState === "complete") fn(); else window.addEventListener("load", fn, { once: true }); };

  /* ---------------------------------------------------------------
     BOOT
  --------------------------------------------------------------- */
  initTheme();
  initSidebar();
  initPresentation();
  initMisc();
  window.dispatchEvent(new Event("themesync"));
})();