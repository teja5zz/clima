/* Application shell: state, routing, data loading and shared UI helpers. */
window.App = window.App || {};
(function (App) {
  "use strict";
  const S = App.S;

  App.state = { ds: null };
  App.views = {};

  App.NAV = [
    { group: "Start", items: [
      { id: "home", label: "Home and choose location", icon: "house" },
    ] },
    { group: "Climate analysis", items: [
      { id: "summary", label: "Climate summary", icon: "chart-bar", needsData: true },
      { id: "temperature", label: "Temperature and humidity", icon: "thermometer-simple", needsData: true },
      { id: "sun", label: "Sun and clouds", icon: "cloud-sun", needsData: true },
      { id: "wind", label: "Wind", icon: "wind", needsData: true },
      { id: "psychro", label: "Psychrometric chart", icon: "drop", needsData: true },
      { id: "explorer", label: "Data explorer", icon: "chart-scatter", needsData: true },
    ] },
    { group: "Design for India", items: [
      { id: "vastu", label: "Vastu × Science planner", icon: "compass" },
      { id: "india", label: "Climate zone and IMAC comfort", icon: "map-trifold", needsData: true },
      { id: "strategies", label: "Design strategy advisor", icon: "lightbulb", needsData: true },
      { id: "ventilation", label: "Natural ventilation", icon: "arrows-left-right", needsData: true },
      { id: "outdoor", label: "Outdoor comfort and heat stress", icon: "umbrella", needsData: true },
      { id: "shading", label: "Shading designer", icon: "sun-horizon", needsData: true },
      { id: "envelope", label: "Envelope and ENS calculator", icon: "wall" },
    ] },
    { group: "Resources", items: [
      { id: "learn", label: "Methods and guide", icon: "book-open" },
      { id: "about", label: "About and citation", icon: "info" },
    ] },
  ];

  /* ---------- tiny DOM helpers ---------- */
  App.$ = function (sel, root) { return (root || document).querySelector(sel); };
  App.$$ = function (sel, root) { return Array.from((root || document).querySelectorAll(sel)); };
  App.esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  App.fmt = function (v, d) { return isFinite(v) ? (+v).toFixed(d == null ? 1 : d) : "–"; };

  App.toast = function (msg, kind) {
    const t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.setAttribute("role", "status");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add("show"); }, 10);
    setTimeout(function () { t.classList.remove("show"); setTimeout(function () { t.remove(); }, 300); }, 4200);
  };

  /* ---------- reusable controls ---------- */
  function monthOptions(sel) {
    return S.MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === sel ? " selected" : "") + ">" + m + "</option>"; }).join("");
  }
  function hourOptions(sel) {
    let s = "";
    for (let h = 1; h <= 24; h++) s += '<option value="' + h + '"' + (h === sel ? " selected" : "") + ">" + (h < 10 ? "0" : "") + h + ":00</option>";
    return s;
  }
  App.varOptions = function (sel, keys, withNone) {
    keys = keys || App.exploreKeys();
    return (withNone ? '<option value="none">None</option>' : "") + keys.map(function (k) {
      return '<option value="' + k + '"' + (k === sel ? " selected" : "") + ">" + App.esc(App.vname(k)) + "</option>";
    }).join("");
  };

  // Month / hour range picker; id prefix p. Returns HTML.
  App.timeFilter = function (p, def) {
    def = def || {};
    return '<div class="field"><label>Months</label><div class="pair">' +
      '<select id="' + p + '-m0" aria-label="From month">' + monthOptions(def.m0 || 1) + "</select><span>to</span>" +
      '<select id="' + p + '-m1" aria-label="To month">' + monthOptions(def.m1 || 12) + "</select></div></div>" +
      '<div class="field"><label>Hours</label><div class="pair">' +
      '<select id="' + p + '-h0" aria-label="From hour">' + hourOptions(def.h0 || 1) + "</select><span>to</span>" +
      '<select id="' + p + '-h1" aria-label="To hour">' + hourOptions(def.h1 || 24) + "</select></div></div>";
  };
  App.readTime = function (p) {
    return { m0: +App.$("#" + p + "-m0").value, m1: +App.$("#" + p + "-m1").value, h0: +App.$("#" + p + "-h0").value, h1: +App.$("#" + p + "-h1").value };
  };

  App.stat = function (label, value, sub, cls) {
    return '<div class="stat ' + (cls || "") + '"><div class="stat-label">' + label + '</div><div class="stat-value">' + value + "</div>" +
      (sub ? '<div class="stat-sub">' + sub + "</div>" : "") + "</div>";
  };

  App.card = function (title, body, opts) {
    opts = opts || {};
    return '<section class="card ' + (opts.cls || "") + '"' + (opts.id ? ' id="' + opts.id + '"' : "") + ">" +
      (title ? '<header class="card-head"><h2>' + title + "</h2>" + (opts.aside || "") + "</header>" : "") +
      (opts.lead ? '<p class="lead">' + opts.lead + "</p>" : "") + body + "</section>";
  };

  App.chartBox = function (id, cls) { return '<div class="chart ' + (cls || "") + '" id="' + id + '"></div>'; };

  App.pageHead = function (title, lead) {
    const ds = App.state.ds;
    return '<div class="page-head"><div><h1>' + title + "</h1>" + (lead ? '<p class="page-lead">' + lead + "</p>" : "") + "</div>" +
      (ds ? '<div class="loc-pill" title="Active weather file">' + App.esc(ds.meta.city) + (ds.meta.country ? ", " + App.esc(ds.meta.country) : "") + "</div>" : "") + "</div>";
  };

  App.needData = function () {
    return '<div class="empty"><div class="empty-icon">' + App.icon("map-pin") + '</div><h2>Pick your city to begin</h2>' +
      "<p>This tool reads the weather file for your site. Choose the nearest of over 400 Indian weather stations, or upload your own EPW file.</p>" +
      '<a class="btn primary" href="#/home#stations">Choose my city</a></div>';
  };

  /* ---------- data loading ---------- */
  App.setDataset = function (ds) {
    App.state.ds = ds;
    try { sessionStorage.setItem("csi-last", ds.meta.city); } catch (e) { /* storage unavailable */ }
    App.renderLocationBar();
    App.syncShareUrl();
    ds.warnings.forEach(function (w) { App.toast(w, "warn"); });
    if (App.track) App.track("weather_loaded", { source: ds.meta.sourceUrl ? (/onebuilding/.test(ds.meta.sourceUrl) ? "onebuilding" : "energyplus") : "upload", zone: ds.nbc.zone });
    App.toast("Loaded " + ds.meta.city + " — " + S.NBC_ZONES[ds.nbc.zone].label + " climate (NBC 2016).", "ok");
    App.updateNav();
  };

  App.loadFile = async function (file) {
    App.busy(true, "Reading " + file.name + "…");
    try {
      const buf = await file.arrayBuffer();
      const ds = await App.readEpwFromBuffer(buf, file.name);
      App.setDataset(ds);
      location.hash = "#/summary";
    } catch (e) {
      App.toast(e.message || String(e), "err");
    } finally { App.busy(false); }
  };

  App.loadUrl = async function (url, opts) {
    opts = opts || {};
    App.busy(true, "Downloading weather file…");
    try {
      const ds = await App.readEpwFromUrl(url);
      App.setDataset(ds);
      if (!opts.stay) location.hash = "#/" + (opts.view || "summary");
      else App.route();
    } catch (e) {
      App.toast(e.message || String(e), "err");
    } finally { App.busy(false); }
  };

  // Keep ?epw=<url> in the address bar so the analysis can be shared as a link.
  App.syncShareUrl = function () {
    const ds = App.state.ds;
    const params = new URLSearchParams(location.search);
    if (ds && ds.meta.sourceUrl) params.set("epw", ds.meta.sourceUrl); else params.delete("epw");
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  };

  App.shareLink = function () {
    return location.origin + location.pathname + location.search + location.hash;
  };

  App.busy = function (on, msg) {
    const b = App.$("#busy");
    b.hidden = !on;
    if (msg) App.$("#busy-msg").textContent = msg;
  };

  App.renderLocationBar = function () {
    const ds = App.state.ds, el = App.$("#loc-bar");
    if (!ds) { el.innerHTML = '<span class="muted">No weather file loaded</span>'; return; }
    const z = S.NBC_ZONES[ds.nbc.zone];
    el.innerHTML = '<span class="loc-name">' + App.esc(ds.meta.city) + "</span>" +
      '<span class="muted">' + ds.meta.lat.toFixed(2) + "°, " + ds.meta.lon.toFixed(2) + "° · UTC" + (ds.meta.tz >= 0 ? "+" : "") + ds.meta.tz + "</span>" +
      '<span class="zone-chip" style="--z:' + z.color + '">' + z.label + "</span>";
  };

  /* ---------- navigation ---------- */
  function navLinks(cls) {
    return App.NAV.map(function (g) {
      return '<div class="nav-group"><div class="nav-title">' + g.group + "</div>" + g.items.map(function (it) {
        return '<a class="' + cls + '" data-view="' + it.id + '" href="#/' + it.id + '">' + App.icon(it.icon, "nav-ic") + "<span>" + it.label + "</span></a>";
      }).join("") + "</div>";
    }).join("");
  }
  App.buildNav = function () {
    App.$("#nav").innerHTML = navLinks("nav-link");
    App.$("#menu-nav").innerHTML = '<a class="btn primary menu-cta" href="#/vastu">Start your free plan</a>' + navLinks("nav-link");
  };

  // Full-height menu: links arrive one after another, 60 ms apart, the whole run capped at 400 ms.
  App.setMenu = function (open) {
    const menu = App.$("#menu"), btn = App.$("#nav-toggle");
    if (open === document.body.classList.contains("menu-open")) return;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (open) {
      const links = App.$$(".nav-title, .nav-link, .menu-cta", menu), step = Math.min(60, 400 / Math.max(1, links.length - 1));
      links.forEach(function (a, i) { a.style.setProperty("--d", Math.round(i * step) + "ms"); });
      menu.hidden = false;
      requestAnimationFrame(function () { requestAnimationFrame(function () { document.body.classList.add("menu-open"); }); });
    } else {
      document.body.classList.remove("menu-open");
      setTimeout(function () { if (!document.body.classList.contains("menu-open")) menu.hidden = true; }, 500);
    }
  };

  App.updateNav = function () {
    const cur = App.currentView();
    const all = App.NAV.flatMap(function (g) { return g.items; });
    App.$$(".nav-link").forEach(function (a) {
      const it = all.find(function (x) { return x.id === a.dataset.view; });
      a.classList.toggle("active", a.dataset.view === cur);
      a.classList.toggle("locked", !!(it.needsData && !App.state.ds));
      if (a.dataset.view === cur) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    const group = cur === "vastu" || cur === "learn" || cur === "about" ? cur : ["home", "notfound", "privacy", "terms"].indexOf(cur) >= 0 ? "" : "climate";
    App.$$("[data-nav]").forEach(function (a) {
      a.classList.toggle("on", a.dataset.nav === group);
      if (a.dataset.nav === group) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  };

  // "#/view", "#/view?query" or "#/view#section"; an unknown view is a 404.
  App.currentView = function () {
    const h = location.hash.replace(/^#\/?/, "").split(/[?#]/)[0];
    return !h ? "home" : App.views[h] ? h : "notfound";
  };

  // Sections rise 32 px and fade in once as they enter the viewport.
  App.reveal = function (root) {
    const els = App.$$("[data-reveal]", root);
    if (!els.length) return;
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -10% 0px" });
    els.forEach(function (el) { io.observe(el); });
  };

  App.route = function () {
    const id = App.currentView();
    const view = App.views[id];
    const main = App.$("#main");
    const item = App.NAV.flatMap(function (g) { return g.items; }).find(function (x) { return x.id === id; });
    App.$$(".chart", main).forEach(function (c) { try { Plotly.purge(c); } catch (e) { /* not a plot */ } });
    if (item && item.needsData && !App.state.ds) {
      main.innerHTML = App.pageHead(item.label) + App.needData();
    } else {
      main.innerHTML = view.html();
      if (view.mount) view.mount(main);
    }
    // full-screen tools (the planner) hide the site navigation and footer; the landing page has no sidebar
    document.body.classList.toggle("studio", !!(view.studio && !(item && item.needsData && !App.state.ds)));
    document.body.classList.toggle("landing", !!view.landing);
    document.title = view.title || (item ? item.label + " · " : "") + (window.BRAND.product || "") + " · " + (window.BRAND.company || "");
    App.updateNav();
    App.setMenu(false);
    App.reveal(main);
    const anchor = location.hash.split("#")[2], target = anchor && document.getElementById(anchor);
    if (target) setTimeout(function () { target.scrollIntoView(); }, 0); else window.scrollTo(0, 0);
    main.focus({ preventScroll: true });
  };

  App.rerender = function () { App.route(); };

  /* ---------- branding ---------- */
  App.applyBrand = function () {
    const b = window.BRAND;
    document.documentElement.style.setProperty("--brand", b.accent || "#2f7d4f");
    if (b.ink) document.documentElement.style.setProperty("--navy", b.ink);
    const logo = App.$("#brand-logo");
    if (b.wordmark) logo.src = b.wordmark;
    logo.alt = b.company;
    App.$("#foot-services").innerHTML = (b.services || []).map(function (x) { return "<li>" + App.esc(x) + "</li>"; }).join("");
    App.$$("[data-brand]").forEach(function (el) { el.textContent = b[el.dataset.brand] || ""; });
    const contact = [];
    if (b.phone) contact.push(["phone", '<a href="tel:' + App.esc(b.phone.replace(/\s+/g, "")) + '">' + App.esc(b.phone) + "</a>", "Phone"]);
    if (b.email) contact.push(["envelope-simple", '<a href="mailto:' + App.esc(b.email) + '">' + App.esc(b.email) + "</a>", "Email"]);
    if (b.website) contact.push(["globe-simple", '<a href="' + App.esc(b.website) + '" target="_blank" rel="noopener">' + App.esc(b.website.replace(/^https?:\/\//, "")) + "</a>", "Website"]);
    if (b.address) contact.push(["map-pin", App.esc(b.address), "Address"]);
    App.$("#foot-contact").innerHTML = contact.map(function (c) { return '<li><span class="foot-ic" role="img" aria-label="' + c[2] + '">' + App.icon(c[0]) + "</span><span>" + c[1] + "</span></li>"; }).join("");
  };

  /* ---------- boot ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    App.applyBrand();
    App.buildNav();
    App.renderLocationBar();
    App.$("#units").addEventListener("change", function (e) {
      App.units = e.target.value;
      App.rerender();
    });
    App.$("#nav-toggle").addEventListener("click", function () { App.setMenu(!document.body.classList.contains("menu-open")); });
    App.$("#menu").addEventListener("click", function (e) { if (e.target.closest("a")) App.setMenu(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.body.classList.contains("menu-open")) { App.setMenu(false); App.$("#nav-toggle").focus(); }
    });
    // the skip link moves focus without going through the router
    App.$("[data-skip]").addEventListener("click", function (e) { e.preventDefault(); App.$("#main").focus(); });
    // global drag & drop of weather files
    document.addEventListener("dragover", function (e) { e.preventDefault(); document.body.classList.add("dragging"); });
    document.addEventListener("dragleave", function (e) { if (!e.relatedTarget) document.body.classList.remove("dragging"); });
    document.addEventListener("drop", function (e) {
      e.preventDefault(); document.body.classList.remove("dragging");
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) App.loadFile(f);
    });
    window.addEventListener("hashchange", App.route);
    App.route();
    const shared = new URLSearchParams(location.search).get("epw");
    if (shared) App.loadUrl(shared, { stay: true });
  });
})(window.App);
