/* Vastu × Science planner — a full-screen design studio.
   App bar (plan name, saved state, tabs, score, undo/redo, share, menu), a contextual panel
   (Plot · Rooms · Climate · Report, or the inspector of the selected room), and a zoomable
   drawing. On phones the panel is a bottom sheet and the tabs sit at the bottom.
   The plan engine lives in core/planner.js and the climate strategies in core/strategies.js. */
(function (App) {
  "use strict";
  const P = App.Plan, FT = P.FT, DIRS = P.DIRS, Z = App.VASTU_ZONES;
  const STORE = "tc-vastu-plan-v2";
  const TABS = [["plot", "Plot", "◱"], ["rooms", "Rooms", "▦"], ["climate", "Climate", "☀"], ["report", "Report", "▤"]];
  const PLOT = 0, ROOMS = 1, CLIMATE = 2, REPORT = 3;
  const QUICK_SIZES = [[30, 40], [30, 50], [40, 60], [50, 80], [60, 90]];
  const DIR_NAMES = { N: "North", NE: "North-East", E: "East", SE: "South-East", S: "South", SW: "South-West", W: "West", NW: "North-West" };

  const st = {
    loaded: false, tab: ROOMS, site: null, items: [], weight: 0.5, name: "", sel: null, zoneInfo: null, touched: false,
    show: { zones: true, climate: true, dims: true, shade: true, mat: true, vent: true, trees: true, win: true },
    underlay: null, underlayOpacity: 0.5, underlayFit: "plot", trace: false, tool: null,
    hist: [], fut: [], locOpen: false,
    start: false, quick: { preset: "3bhk", W: 40, D: 60, facing: 90 },   // start screen
    vb: null, sheet: "half", pop: null, savedAt: 0,                      // camera, mobile sheet, open popover
  };
  let root = null, metrics = null, drag = null, keysBound = false;
  const pointers = new Map();

  /* ---------- state ---------- */
  function ctx() { return { site: st.site, metrics: metrics, weight: metrics ? st.weight : 1 }; }
  function snapshot() { return JSON.stringify(P.pack(st)); }
  function restore(json) {
    const s = P.unpack(JSON.parse(json));
    // keep item ids stable where possible so the selection survives undo
    s.items.forEach(function (it, i) { if (st.items[i] && st.items[i].t === it.t) it.uid = st.items[i].uid; });
    st.site = s.site; st.items = s.items; st.weight = s.weight; st.name = s.name;
    if (!find(st.sel)) st.sel = null;
  }
  function change(fn, opts) {
    st.hist.push(snapshot()); if (st.hist.length > 80) st.hist.shift();
    st.fut = [];
    fn();
    if (!(opts && opts.auto)) st.touched = true;
    save(); renderAll();
  }
  function undo() { if (!st.hist.length) return; st.fut.push(snapshot()); restore(st.hist.pop()); save(); renderAll(); App.toast("Undone.", "ok"); }
  function redo() { if (!st.fut.length) return; st.hist.push(snapshot()); restore(st.fut.pop()); save(); renderAll(); }
  function save() {
    const code = P.serialize(st);
    try { localStorage.setItem(STORE, JSON.stringify({ code: code, touched: st.touched })); st.savedAt = Date.now(); } catch (e) { st.savedAt = 0; }
    if (App.currentView() === "vastu") history.replaceState(null, "", location.pathname + location.search + "#/vastu?plan=" + code);
    const el = root && App.$("#pl-saved", root);
    if (el) { el.textContent = st.savedAt ? "Saved" : "Not saved on this device"; el.classList.toggle("off", !st.savedAt); }
  }
  function load() {
    st.loaded = true;
    try {
      const img = JSON.parse(localStorage.getItem(STORE + "-img") || "null");
      if (img && /^data:image\//.test(img.src)) { st.underlay = img.src; st.underlayFit = img.fit === "building" ? "building" : "plot"; st.underlayOpacity = +img.op || 0.5; }
    } catch (e) { /* ignore */ }
    const m = location.hash.match(/[?&]plan=([A-Za-z0-9_-]+)/);
    if (m) {
      try { Object.assign(st, P.deserialize(m[1])); st.touched = true; return; }
      catch (e) { App.toast(e.message, "err"); }
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved && saved.code) { Object.assign(st, P.deserialize(saved.code)); st.touched = !!saved.touched; st.savedAt = Date.now(); return; }
    } catch (e) { /* ignore a damaged autosave */ }
    // first visit: a sample plan behind the start screen
    st.site = P.defaultSite();
    st.items = P.fromPreset("3bhk");
    arrange();
    st.start = true;
  }
  function arrange() { st.items = P.autoArrange(ctx(), st.items); st.touched = false; }
  function fp() { return P.footprint(st.site, st.items); }
  function find(uid) { return st.items.find(function (it) { return it.uid === uid; }) || null; }
  function def(it) { return App.VASTU_ROOM[it.t]; }
  function name(it) { return it.n || it.auto || def(it).label; }
  function mobile() { return window.matchMedia("(max-width: 860px)").matches; }

  /* ---------- units ---------- */
  function ft() { return st.site.units === "ft"; }
  function toU(m) { return ft() ? m / FT : m; }
  function fromU(v) { return ft() ? v * FT : v; }
  function uVal(m) { return ft() ? (Math.round(m / FT * 10) / 10) : (Math.round(m * 100) / 100); }
  function uName() { return ft() ? "ft" : "m"; }
  function len(m) {
    if (!ft()) return m.toFixed(2) + " m";
    const inch = Math.round(m / 0.0254), f = Math.floor(inch / 12), i = inch % 12;
    return f + "′" + (i ? " " + i + "″" : "");
  }
  function area(m2, both) {
    const sq = Math.round(m2 / (FT * FT));
    if (ft()) return sq.toLocaleString("en-IN") + " sq ft" + (both ? " (" + m2.toFixed(0) + " m²)" : "");
    return m2.toFixed(1) + " m²" + (both ? " (" + sq.toLocaleString("en-IN") + " sq ft)" : "");
  }
  function pct(v) { return v == null ? "–" : Math.round(100 * v); }
  function grade(v) { return v == null ? "na" : v >= 0.75 ? "good" : v >= 0.5 ? "ok" : "bad"; }

  /* ---------- view ---------- */
  App.views.vastu = {
    studio: true,
    html: function () {
      return '<div class="studio" id="pl-studio">' +
        '<header class="st-bar" id="pl-bar"></header>' +
        '<div class="st-body" id="pl-work">' +
        '<aside class="st-panel" id="pl-sheet" aria-label="Planner panel"><button type="button" class="st-grip" data-act="sheet" aria-label="Expand or collapse the panel"><span></span></button>' +
        '<div class="st-panel-in" id="pl-panel" aria-live="polite"></div></aside>' +
        '<section class="st-stage" id="pl-canvas" aria-label="Plan drawing">' +
        '<svg id="pl-svg" class="pl-svg" role="application" aria-label="Plot plan. Select a room, then use arrow keys to move it. Plus and minus zoom."></svg>' +
        '<div class="st-float st-layers" id="pl-layers"></div>' +
        '<div class="st-float st-zoom" id="pl-zoom"></div>' +
        '<div class="st-float st-hint" id="pl-hint" aria-live="polite"></div>' +
        '<div class="st-float st-legend" id="pl-legend"></div>' +
        '<div class="pl-drop" id="pl-drop" hidden>Drop here</div>' +
        '<div class="st-start" id="pl-start" hidden></div></section></div>' +
        '<div id="pl-report" class="st-report" hidden></div>' +
        '<nav class="st-tabs st-tabs-bottom" id="pl-tabs-m" aria-label="Planner sections"></nav>' +
        '<input type="file" id="pl-import" data-act="import-file" accept=".json,application/json" hidden></div>';
    },
    mount: function (r) {
      root = r;
      if (!st.loaded) load();
      const ds = App.state.ds;
      metrics = ds ? App.siteMetrics(ds) : null;
      if (!st.touched) arrange(); // climate may have changed the best layout
      bind();
      if (!st.savedAt && !st.start) save(); // a plan opened from a link is kept on this device
      renderAll();
    },
  };

  function renderAll() {
    if (!root || !root.isConnected) return;
    renderBar();
    const report = st.tab === REPORT;
    App.$("#pl-work", root).hidden = report;
    App.$("#pl-report", root).hidden = !report;
    if (report) { renderReport(); return; }
    const sheet = App.$("#pl-sheet", root);
    sheet.className = "st-panel sheet-" + st.sheet + (st.sel ? " insp" : "");
    renderPanel(); renderCanvas(); renderFloat(); renderStart();
  }

  /* ---------- app bar ---------- */
  function tabsHtml() {
    return TABS.map(function (t, i) {
      return '<button type="button" class="st-tab' + (i === st.tab ? " on" : "") + '" data-act="tab" data-tab="' + i + '" role="tab" aria-selected="' + (i === st.tab) + '">' +
        '<span class="st-tab-ic" aria-hidden="true">' + t[2] + "</span><span>" + t[1] + "</span></button>";
    }).join("");
  }
  function renderBar() {
    const ev = P.evaluate(ctx(), st.items);
    const errs = ev.issues.filter(function (i) { return i.sev === "error" || i.sev === "warn"; }).length;
    const g = grade(ev.total), deg = ev.total == null ? 0 : Math.round(360 * ev.total);
    const menu = st.pop === "menu" ? '<div class="st-pop st-menu" role="menu">' +
      '<button type="button" role="menuitem" data-act="new">✚ New plan…</button>' +
      '<button type="button" role="menuitem" data-act="import">⇪ Open plan file…</button>' +
      '<button type="button" role="menuitem" data-act="json">⤓ Download plan file</button>' +
      '<button type="button" role="menuitem" data-act="svg">⤓ Download drawing (SVG)</button>' +
      '<button type="button" role="menuitem" data-act="tab" data-tab="3">▤ Report &amp; print</button>' +
      '<button type="button" role="menuitem" data-act="help">? Shortcuts &amp; help</button></div>' : "";
    const score = st.pop === "score" ? '<div class="st-pop st-scorepop" role="dialog" aria-label="Plan score">' +
      '<p class="small muted">How well the rooms sit for Vastu and for this site\'s climate' + (metrics ? "" : " (pick a city in Plot to add climate)") + ".</p>" +
      scoreBar("Vastu", ev.vastu) + scoreBar("Climate", ev.climate) + scoreBar("Overall", ev.total) +
      '<button type="button" class="btn sm" data-act="issues">' + (ev.issues.length ? "See " + ev.issues.length + " checks" : "No checks to review") + "</button></div>" : "";
    App.$("#pl-bar", root).innerHTML =
      '<div class="st-title"><label class="sr" for="pl-pname">Plan name</label><input id="pl-pname" data-act="pname" maxlength="60" value="' + App.esc(st.name || "") + '" placeholder="Untitled plan">' +
      '<span class="st-saved' + (st.savedAt ? "" : " off") + '" id="pl-saved">' + (st.savedAt ? "Saved" : "Not saved yet") + "</span></div>" +
      '<nav class="st-tabs st-tabs-top" role="tablist" aria-label="Planner sections">' + tabsHtml() + "</nav>" +
      '<div class="st-actions">' +
      '<div class="st-popwrap"><button type="button" class="st-score ' + g + '" data-act="pop" data-pop="score" aria-expanded="' + (st.pop === "score") + '" title="Plan score">' +
      '<span class="pl-ring" style="--deg:' + deg + 'deg"><span>' + pct(ev.total) + "</span></span><span class=\"st-score-t\"><b>Score</b><small>" +
      (errs ? "⚠ " + errs + " to fix" : ev.issues.length ? ev.issues.length + " to review" : "✓ No problems") + "</small></span></button>" + score + "</div>" +
      '<button type="button" class="icon-btn st-ib" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo"' + (st.hist.length ? "" : " disabled") + ">↶</button>" +
      '<button type="button" class="icon-btn st-ib" data-act="redo" title="Redo (Ctrl+Y)" aria-label="Redo"' + (st.fut.length ? "" : " disabled") + ">↷</button>" +
      '<button type="button" class="btn sm primary st-share" data-act="share">Share</button>' +
      '<div class="st-popwrap"><button type="button" class="icon-btn st-ib" data-act="pop" data-pop="menu" aria-haspopup="menu" aria-expanded="' + (st.pop === "menu") + '" aria-label="More">⋯</button>' + menu + "</div></div>";
    App.$("#pl-tabs-m", root).innerHTML = tabsHtml();
  }

  /* ---------- floating canvas controls ---------- */
  function renderFloat() {
    const tog = function (k, label) { return '<button type="button" class="chip' + (st.show[k] ? " on" : "") + '" data-act="toggle" data-k="' + k + '" aria-pressed="' + st.show[k] + '">' + label + "</button>"; };
    App.$("#pl-layers", root).innerHTML = st.tab === CLIMATE && metrics
      ? tog("win", "Windows") + tog("vent", "Airflow") + tog("mat", "Walls") + tog("shade", "Shading") + tog("trees", "Planting") + tog("zones", "Zones")
      : tog("zones", "Vastu zones") + (metrics ? tog("climate", "Sun & wind") : "") + tog("dims", "Sizes");
    const z = Math.round(100 * zoomLevel());
    App.$("#pl-zoom", root).innerHTML = '<button type="button" data-act="zoom-out" aria-label="Zoom out" title="Zoom out (−)">−</button>' +
      '<button type="button" data-act="fit" class="st-zv" title="Fit the plan (0)">' + z + "%</button>" +
      '<button type="button" data-act="zoom-in" aria-label="Zoom in" title="Zoom in (+)">+</button>';
    let hint;
    const tool = st.tool && App.VASTU_ROOM[st.tool];
    if (tool) hint = tool.kind === "room" ? "Drag a box over the <b>" + tool.label + "</b> on your drawing" : "Tap where the <b>" + tool.label + "</b> is";
    else if (st.sel) hint = mobile() ? "Drag to move · corners resize" : "Drag to move · corners resize · arrows nudge · R rotate · Del remove";
    else hint = mobile() ? "Tap a room · drag to pan · pinch to zoom" : "Click a room to edit · drag empty space to pan · scroll to zoom";
    App.$("#pl-hint", root).innerHTML = hint;
    let lg;
    if (st.tab === CLIMATE && metrics) lg = '<span><i class="lg-mat high"></i>Hot wall</span><span><i class="lg-mat mid"></i>Moderate</span><span><i class="lg-mat low"></i>Cool</span><span><i class="lg-chajja"></i>Chajja</span><span><i class="lg-wind">➜</i>Breeze</span><span><i class="lg-tree"></i>Trees</span>';
    else lg = '<span><i class="lg-dot good"></i>Vastu preferred</span><span><i class="lg-dot ok"></i>Neutral</span><span><i class="lg-dot bad"></i>Avoid</span>';
    App.$("#pl-legend", root).innerHTML = lg;
  }
  function renderLegend() { renderFloat(); }

  /* ---------- start screen ---------- */
  function renderStart() {
    const el = App.$("#pl-start", root);
    el.hidden = !st.start;
    if (!st.start) { el.innerHTML = ""; return; }
    const q = st.quick;
    const dirBtn = function (d) {
      if (!d) return '<span class="st-qmid" aria-hidden="true">road<br>faces</span>';
      const az = DIRS.indexOf(d) * 45;
      return '<button type="button" class="pl-dir' + (q.facing === az ? " on" : "") + '" data-act="q-facing" data-az="' + az + '" aria-pressed="' + (q.facing === az) + '">' + d + "</button>";
    };
    el.innerHTML = '<div class="st-start-card" role="dialog" aria-labelledby="st-start-h">' +
      '<h2 id="st-start-h">Plan a Vastu-smart, climate-smart home</h2>' +
      '<p class="muted">Answer three quick questions and the planner places every room for you. You can drag anything afterwards.</p>' +
      '<div class="st-q"><h3>1 · House type</h3><div class="st-qrow">' + App.VASTU_PRESETS.map(function (p) {
        return '<button type="button" class="st-qopt' + (q.preset === p.id ? " on" : "") + '" data-act="q-preset" data-p="' + p.id + '" aria-pressed="' + (q.preset === p.id) + '">' + p.label + "</button>";
      }).join("") + "</div></div>" +
      '<div class="st-q"><h3>2 · Plot size (feet)</h3><div class="st-qrow">' + QUICK_SIZES.map(function (s) {
        const on = q.W === s[0] && q.D === s[1];
        return '<button type="button" class="st-qopt' + (on ? " on" : "") + '" data-act="q-size" data-w="' + s[0] + '" data-d="' + s[1] + '" aria-pressed="' + on + '">' + s[0] + " × " + s[1] + "</button>";
      }).join("") + "</div></div>" +
      '<div class="st-q"><h3>3 · Which way does the road side face?</h3><div class="pl-dirs st-qdirs">' + ["NW", "N", "NE", "W", "", "E", "SW", "S", "SE"].map(dirBtn).join("") + "</div></div>" +
      '<div class="st-start-go"><button type="button" class="btn primary" data-act="start-quick">Create my plan →</button>' +
      (st.items.length && !st.fresh ? '<button type="button" class="btn ghost" data-act="start-close">Keep my current plan</button>' : "") + "</div>" +
      '<div class="st-start-alt"><span class="muted small">Or</span>' +
      '<label class="st-alt" for="pl-img-start">✎ Trace my plan drawing<input type="file" id="pl-img-start" class="sr" accept="image/*" data-act="underlay-start"></label>' +
      '<button type="button" class="st-alt" data-act="start-blank">▢ Start with a blank plot</button>' +
      '<button type="button" class="st-alt" data-act="import">⇪ Open a plan file</button></div></div>';
  }

  /* ---------- panels ---------- */
  function renderPanel() {
    // keep keyboard focus on the same control (by id, else by position) across re-renders
    const el = App.$("#pl-panel", root), active = document.activeElement, inside = active && el.contains(active);
    const focusables = function () { return App.$$("input, select, button, a[href]", el); };
    const fid = inside ? active.id : null, fidx = inside ? focusables().indexOf(active) : -1;
    const it = find(st.sel);
    el.innerHTML = it ? inspector(ctx(), P.evaluate(ctx(), st.items), it) : [panelSite, panelRooms, panelClimate][st.tab]();
    const f = fid ? document.getElementById(fid) : fidx >= 0 ? focusables()[Math.min(fidx, focusables().length - 1)] : null;
    if (f) f.focus({ preventScroll: true });
  }

  function numField(id, label, m, opts) {
    opts = opts || {};
    return '<div class="field"><label for="' + id + '">' + label + '</label><div class="pl-unit"><input type="number" id="' + id + '" data-act="' + (opts.act || id) + '" value="' + uVal(m) + '" min="' + (opts.min || 0) + '" step="' + (ft() ? 0.5 : 0.1) + '" inputmode="decimal"><span>' + uName() + "</span></div></div>";
  }

  function locBlock() {
    const ds = App.state.ds;
    if (ds && !st.locOpen) {
      const z = App.S.NBC_ZONES[ds.nbc.zone];
      return '<div class="pl-loc"><div><b>' + App.esc(ds.meta.city) + '</b><span class="zone-chip" style="--z:' + z.color + '">' + z.label + "</span>" +
        '<div class="small muted">Sun, heat and breeze from this weather file score every room.</div></div><button type="button" class="btn sm ghost" data-act="loc-open">Change</button></div>';
    }
    return '<div class="pl-locpick"><label for="pl-city" class="sr">City</label><input type="search" id="pl-city" list="pl-cities" placeholder="Type your city, e.g. Mysuru" autocomplete="off">' +
      '<datalist id="pl-cities">' + App.INDIA_CITIES.map(function (c) { return '<option value="' + App.esc(c.city) + '">' + App.esc(c.state) + "</option>"; }).join("") + "</datalist>" +
      '<div class="btn-row tight"><button type="button" class="btn sm primary" data-act="loc-go">Load climate</button><button type="button" class="btn sm" data-act="loc-near">⌖ Near me</button>' +
      (ds ? '<button type="button" class="btn sm ghost" data-act="loc-close">Cancel</button>' : "") + "</div>" +
      '<p class="small muted">' + (ds ? "" : "Without a city the plan is scored by Vastu only. ") + "We use the nearest of 400+ Indian weather stations.</p></div>";
  }

  function panelSite() {
    const s = st.site, ds = App.state.ds, dirOf = DIRS[P.dirIndex(s.facing)];
    const loc = locBlock();
    const dirBtn = function (d) {
      return '<button type="button" class="pl-dir' + (d === dirOf ? " on" : "") + '" data-act="facing" data-az="' + DIRS.indexOf(d) * 45 + '" aria-pressed="' + (d === dirOf) + '">' + d + "</button>";
    };
    const exact = ((s.facing + (s.fine || 0)) % 360 + 360) % 360;
    return '<h2 class="pl-h">Your plot</h2>' +
      '<section class="pl-sec"><h3>Location</h3>' + loc + "</section>" +
      '<section class="pl-sec"><h3>Plot size</h3>' +
      '<div class="seg" role="group" aria-label="Units"><button type="button" data-act="units" data-u="ft" class="' + (ft() ? "on" : "") + '">Feet</button><button type="button" data-act="units" data-u="m" class="' + (ft() ? "" : "on") + '">Metres</button></div>' +
      '<div class="pl-row2">' + numField("pl-W", "Width (road side)", s.W, { min: 3 }) + numField("pl-D", "Depth", s.D, { min: 3 }) + "</div>" +
      '<div class="quick">' + QUICK_SIZES.map(function (q) { return '<button type="button" class="chip" data-act="size" data-w="' + q[0] + '" data-d="' + q[1] + '">' + q[0] + "×" + q[1] + " ft</button>"; }).join("") + "</div>" +
      '<p class="small muted">Plot area <b>' + area(s.W * s.D, true) + "</b></p></section>" +
      '<section class="pl-sec"><h3>Which way does the plot face?</h3>' +
      '<p class="small muted">Stand in the plot facing the road — the direction you look is the plot\'s facing.</p>' +
      '<div class="pl-dirs">' + ["NW", "N", "NE", "W", "", "E", "SW", "S", "SE"].map(function (d) {
        return d ? dirBtn(d) : '<div class="pl-dir-mid" aria-hidden="true"><svg viewBox="-20 -20 40 40"><g transform="rotate(' + P.theta(s) + ')"><path d="M0 -15 L5 3 L0 0 L-5 3Z" fill="var(--brand)"/><text y="13" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">N</text></g></svg></div>';
      }).join("") + "</div>" +
      '<div class="field"><label for="pl-fine">Exact bearing of the road side: <output>' + exact + "° (" + DIR_NAMES[dirOf] + (s.fine ? (s.fine > 0 ? " +" : " ") + s.fine + "°" : "") + ")</output></label>" +
      '<input type="range" id="pl-fine" data-act="fine" min="-22" max="22" step="1" value="' + (s.fine || 0) + '"><small class="muted">Fine-tune if the plot is turned from the compass grid (check your survey sketch).</small></div>' +
      '<div class="field"><label for="pl-corner">Corner plot?</label><select id="pl-corner" data-act="corner">' +
      [["", "No — one road"], ["left", "Yes — second road on the left"], ["right", "Yes — second road on the right"]].map(function (o) { return '<option value="' + o[0] + '"' + ((s.corner || "") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div></section>" +
      '<section class="pl-sec"><h3>Setbacks</h3><p class="small muted">Open space your local bylaw requires on each side (e.g. MUDA, BBMP). The dashed line on the drawing is where the building can go.</p>' +
      '<div class="pl-row2">' + numField("pl-sf", "Front (road)", s.set.front, { act: "set", min: 0 }) + numField("pl-sr", "Rear", s.set.rear, { act: "set" }) +
      numField("pl-sl", "Left", s.set.left, { act: "set" }) + numField("pl-sR", "Right", s.set.right, { act: "set" }) + "</div></section>" +
      nextBtn("Next: rooms");
  }

  // "Have a drawing already?": upload a plan image, fit it, then trace its rooms.
  function traceIntro() {
    return '<section class="pl-sec pl-trace"><h3>Have a plan drawing already?</h3>' +
      '<p class="small muted">Upload a photo or scan of your plan, then draw a box over each room. The planner checks it for Vastu and adds climate strategies and materials for your site. The image stays on your device.</p>' +
      '<label class="btn sm" for="pl-img">⇪ ' + (st.underlay ? "Replace plan image" : "Upload plan image") + '</label><input type="file" id="pl-img" class="sr" accept="image/*" data-act="underlay">' +
      (st.underlay ? underlayControls() + '<div class="btn-row tight"><button type="button" class="btn sm primary" data-act="trace-start">✎ Trace rooms on my plan</button></div>' : "") + "</section>";
  }
  function underlayControls() {
    return '<div class="field"><label for="pl-fit">The image shows</label><select id="pl-fit" data-act="underlay-fit">' +
      [["plot", "the whole plot (to the compound wall)"], ["building", "the building only (inside the setbacks)"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (st.underlayFit === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + '</select><small class="muted">Crop the image to that boundary first, and set the plot size and facing in step 1.</small></div>' +
      '<div class="field"><label for="pl-op">Image opacity</label><input type="range" id="pl-op" data-act="underlay-op" min="0.1" max="1" step="0.05" value="' + st.underlayOpacity + '"></div>' +
      '<button type="button" class="btn sm ghost" data-act="underlay-clear">Remove image</button>';
  }

  function nextBtn(label) {
    return '<div class="pl-next"><button type="button" class="btn primary" data-act="next">' + label + " →</button></div>";
  }

  function panelRooms() {
    const c = ctx(), ev = P.evaluate(c, st.items);
    const b = P.buildable(st.site), bArea = (b.x1 - b.x0) * (b.y1 - b.y0);
    const rooms = st.items.filter(function (it) { return def(it).kind === "room"; });
    const used = rooms.reduce(function (a, it) { return a + it.w * it.h; }, 0), share = used / bArea;
    const count = function (t) { return st.items.filter(function (it) { return it.t === t; }).length; };
    const row = function (r) {
      const n = count(r.id);
      return '<li class="' + (n ? "has" : "") + '" draggable="true" data-drag="' + r.id + '" title="Drag onto the plan, or press + to place it in its best spot">' +
        '<i class="sw" style="background:' + r.color + '"></i><div class="pl-rl"><b>' + r.label + "</b>" +
        '<span class="small muted">Best ' + r.pref.map(function (z) { return '<span class="zc" style="--z:' + App.zoneById(z).color + '">' + z + "</span>"; }).join("") +
        (r.area ? " · ~" + area(r.area) : "") + "</span></div>" +
        '<div class="pl-count" role="group" aria-label="' + r.label + ' count"><button type="button" data-act="dec" data-t="' + r.id + '" aria-label="Remove a ' + r.label + '"' + (n ? "" : " disabled") + ">−</button>" +
        "<output>" + n + '</output><button type="button" data-act="inc" data-t="' + r.id + '" aria-label="Add a ' + r.label + '">+</button></div></li>';
    };
    let h = '<h2 class="pl-h">Rooms</h2>';
    if (st.trace) h += tracePanel();
    h += '<section class="pl-sec"><div class="pl-meter ' + (share > 0.95 ? "bad" : share > 0.8 ? "ok" : "good") + '"><div class="pl-meter-bar"><span style="width:' + Math.min(100, Math.round(share * 100)) + '%"></span></div>' +
      '<p class="small"><b>' + area(used) + "</b> of <b>" + area(bArea) + "</b> buildable (" + Math.round(share * 100) + " %)" +
      (share > 0.95 ? " — too full: remove rooms, reduce setbacks or plan a second floor." : share > 0.8 ? " — tight; leave 15–20 % for walls and passages." : " — room left for walls and passages.") + "</p></div>" +
      '<div class="pl-arrange"><div class="field"><label for="pl-weight">Placement balance <output>' + (metrics ? (st.weight === 0.5 ? "equal" : st.weight > 0.5 ? Math.round(st.weight * 100) + " % Vastu" : Math.round((1 - st.weight) * 100) + " % science") : "Vastu only") + "</output></label>" +
      '<input type="range" id="pl-weight" data-act="weight" min="0" max="100" step="5" value="' + Math.round(st.weight * 100) + '"' + (metrics ? "" : " disabled") + '><div class="range-ends"><span>Building science</span><span>Vastu</span></div>' +
      (metrics ? "" : '<small class="muted">Pick a city in <button type="button" class="linkbtn" data-act="tab" data-tab="0">Plot</button> to weigh in the climate.</small>') + "</div>" +
      '<button type="button" class="btn primary sm" data-act="auto">✦ Auto-arrange all rooms</button></div></section>';
    h += issuesBlock(ev.issues);
    h += '<section class="pl-sec"><h3>Add or remove rooms</h3><p class="small muted">Press + to place a room in its best spot' + (mobile() ? "." : ", or drag it onto the plan.") + '</p>' +
      '<ul class="pl-roomlist">' + App.VASTU_ROOMS.filter(function (r) { return r.kind !== "fixture"; }).map(row).join("") + "</ul>" +
      '<h3>Tanks</h3><ul class="pl-roomlist">' + App.VASTU_ROOMS.filter(function (r) { return r.kind === "fixture"; }).map(row).join("") + "</ul></section>";
    h += '<details class="pl-sec pl-more"><summary>Start again from a house type</summary><div class="pl-presets">' + App.VASTU_PRESETS.map(function (p) {
      return '<button type="button" class="pl-preset" data-act="preset" data-p="' + p.id + '"><b>' + p.label + "</b><small>" + p.items.length + " items</small></button>";
    }).join("") + "</div></details>";
    h += '<details class="pl-sec pl-more"' + (st.underlay ? " open" : "") + "><summary>Trace my own plan drawing</summary>" + traceIntro() + "</details>";
    h += st.zoneInfo ? zoneCard(st.zoneInfo) : "";
    return h + nextBtn(metrics ? "Next: climate strategies" : "Next: climate");
  }

  function gauge(label, v, sub) {
    const g = grade(v), deg = v == null ? 0 : Math.round(360 * v);
    return '<div class="pl-gauge ' + g + '"><div class="pl-ring" style="--deg:' + deg + 'deg"><span>' + pct(v) + '</span></div><div><b>' + label + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div></div>";
  }
  function scoreBar(label, v) {
    return '<div class="pl-sbar ' + grade(v) + '"><span>' + label + '</span><div><i style="width:' + (v == null ? 0 : Math.round(100 * v)) + '%"></i></div><b>' + pct(v) + "</b></div>";
  }

  function tracePanel() {
    const tool = st.tool && App.VASTU_ROOM[st.tool];
    return '<section class="pl-sec pl-trace on"><h3>✎ Tracing your plan</h3>' +
      '<p class="small">' + (tool ? (tool.kind === "room" ? "Drag a box over the <b>" + tool.label + "</b> on your drawing." : "Tap where the <b>" + tool.label + "</b> is.") + " Pick another type when done."
        : "Pick a room type, then drag a box over that room on your drawing. For the entrance and tanks, pick and tap.") + "</p>" +
      '<div class="pl-palette">' + App.VASTU_ROOMS.map(function (r) {
        return '<button type="button" class="pl-tool' + (st.tool === r.id ? " on" : "") + '" data-act="tool" data-t="' + r.id + '" aria-pressed="' + (st.tool === r.id) + '"><i class="sw" style="background:' + r.color + '"></i>' + r.short + "</button>";
      }).join("") + "</div>" +
      (st.underlay ? '<div class="field"><label for="pl-op">Image opacity</label><input type="range" id="pl-op" data-act="underlay-op" min="0.1" max="1" step="0.05" value="' + st.underlayOpacity + '"></div>' : "") +
      '<div class="btn-row tight"><button type="button" class="btn sm primary" data-act="trace-done">✓ Done tracing</button>' +
      (metrics ? '<button type="button" class="btn sm" data-act="trace-climate">Climate strategies →</button>' : "") + "</div></section>";
  }

  /* ---------- climate strategies ---------- */
  function strategies() {
    return metrics ? App.planStrategies(App.state.ds, metrics, st.site, st.items) : null;
  }
  const HEAT = { high: "Hot", mid: "Moderate", low: "Cool" };
  function sideChip(x) {
    return '<span class="pl-sidehead"><span class="pl-zchip" style="--z:' + App.zoneById(x.dir).color + '">' + x.dirName + '</span><span class="tag heat-' + x.heat + '">' + HEAT[x.heat] + "</span></span>";
  }
  const ROLE = { inlet: "inlet · breeze in", outlet: "outlet · breeze out", window: "window", high: "high window", vent: "ventilator" };
  function winLine(w) {
    return "<li><b>" + DIR_NAMES[w.dir] + " wall</b> · " + len(w.width) + " × " + len(w.height) + " · sill " + len(w.sill) + ' <span class="tag win-' + w.role + '">' + ROLE[w.role] + "</span></li>";
  }
  function roomClimate(sx, it) {
    const rw = sx.roomWin[it.uid], fac = P.facades(st.site, it, null, sx.footprint);
    let h = '<div class="pl-roomtips"><h3>Keeping this room cool</h3>';
    if (rw && rw.list.length) h += '<ul class="pl-winlist">' + rw.list.map(winLine).join("") + "</ul>" +
      '<p class="small muted">' + (rw.cross ? "✓ Cross-ventilated: openings on two walls." : "Openings on one wall only — add a ventilator above the door into the passage.") + "</p>";
    else if (rw && rw.interior) h += '<p class="small">No outside wall: ventilate with a ventilator above the door, a jaali to the next room or a skylight.</p>';
    fac.forEach(function (fc) {
      const x = sx.sides.find(function (y) { return y.side === fc.side; });
      h += '<p class="small">' + sideChip(x) + "<br><b>Wall:</b> " + App.esc(x.wall.build) + ". <b>Shade:</b> " + App.esc(x.shade.short) + (x.shade.kind === "none" ? "" : " mm") + ".</p>";
    });
    return h + "</div>";
  }
  function panelClimate() {
    let h = '<h2 class="pl-h">Keep it cool</h2>';
    if (!metrics) {
      return h + '<section class="pl-sec"><p>Pick your city to get windows, wall thickness, roof insulation, shading, ventilation and planting worked out from its weather data.</p>' + locBlock() + "</section>" + nextBtn("Next: report");
    }
    const sx = strategies(), nm = {};
    P.numbered(st.items).forEach(function (x) { nm[x.uid] = x.n || x.auto || App.VASTU_ROOM[x.t].label; });
    const checks = sx.checks.filter(function (c) { return c.status !== "tip"; }), met = checks.filter(function (c) { return c.status === "done"; }).length;
    const sec = function (title, body, open) { return '<details class="pl-sec pl-more"' + (open ? " open" : "") + "><summary>" + title + "</summary>" + body + "</details>"; };
    h += '<p class="small muted">From the ' + App.esc(App.state.ds.meta.city) + " weather file · " + sx.zoneLabel + " climate (NBC 2016). Everything below is also drawn on the plan.</p>" +
      '<div class="pl-cool-sum"><div><b>' + sx.vent.crossCount + "/" + sx.vent.habitable + "</b><span>rooms cross-ventilated</span></div>" +
      "<div><b>" + met + "/" + checks.length + "</b><span>cool-home checks met</span></div>" +
      "<div><b>" + sx.windows.length + "</b><span>windows placed</span></div></div>";
    h += sec("Key moves", '<ol class="pl-key">' + sx.key.map(function (k) { return "<li>" + App.esc(k) + "</li>"; }).join("") + "</ol>", true);
    h += sec("Cross-ventilation", '<ul class="tips small">' + sx.vent.tips.map(function (t) { return "<li>" + App.esc(t) + "</li>"; }).join("") + "</ul>" +
      '<p class="small muted">On the plan: dark-blue arrows bring the breeze in through smaller, lower inlet windows; light-blue arrows take it out through larger, higher outlets; dashed lines show the path across the house.</p>', true);
    const byRoom = {};
    sx.windows.forEach(function (w) { (byRoom[w.uid] = byRoom[w.uid] || []).push(w); });
    h += sec("Windows (" + sx.windows.length + ")", '<p class="small muted">Sized to about ' + Math.round(100 * Math.max(sx.openShare, sx.zone === "warm-humid" ? 0.2 : 0.15)) + " % of each room's floor area (at least the " + Math.round(100 * sx.openShare) + " % openable area that Eco-Niwas Samhita 2018 asks for), with less glass on hot walls. Tap a window on the plan for its size.</p>" +
      Object.keys(byRoom).map(function (uid) {
        return '<div class="pl-winroom"><b>' + App.esc(nm[uid] || "") + "</b>" + (sx.roomWin[uid].cross ? ' <span class="tag preferred">cross-ventilated</span>' : "") + '<ul class="pl-winlist">' + byRoom[uid].map(winLine).join("") + "</ul></div>";
      }).join("") + '<p class="small muted">Add a 300–450 mm ventilator near the ceiling above each door and window so the hottest air can always escape.</p>');
    h += sec("Walls — thickness and build-up", '<ul class="pl-slist">' + sx.sides.map(function (x) {
      return "<li>" + sideChip(x) + "<span><b>" + x.wall.mm + " mm</b> — " + App.esc(x.wall.build) + ".</span></li>";
    }).join("") + "</ul><p class=\"small muted\">" + App.esc(sx.partition) + ". On the plan, outside walls are drawn at this thickness and coloured by heat.</p>");
    h += sec("Roof — cutting heat from above", '<p class="small muted">' + App.esc(sx.roof.text) + '</p><ol class="pl-roofopts">' + sx.roofOptions.map(function (r) {
      return "<li><div><b>" + App.esc(r.name) + '</b> <span class="tag cost">' + App.esc(r.cost) + "</span></div><span>" + App.esc(r.spec) + '.</span><small class="muted">' + App.esc(r.effect) + ".</small></li>";
    }).join("") + "</ol>");
    h += sec("Shading", '<ul class="pl-slist">' + sx.sides.map(function (x) { return "<li>" + sideChip(x) + "<span>" + App.esc(x.shade.text) + "<br><b>Glass:</b> " + App.esc(x.window) + "</span></li>"; }).join("") + "</ul>");
    h += sec("Planting & site", '<ul class="pl-slist">' + sx.sides.map(function (x) { return "<li>" + sideChip(x) + "<span>" + App.esc(x.plant.text) + "</span></li>"; }).join("") + "</ul><ul class=\"tips small\">" + sx.site.map(function (t) { return "<li>" + App.esc(t) + "</li>"; }).join("") + "</ul>");
    const icon = { done: "✓", part: "◐", todo: "!", tip: "•" };
    h += sec("Cool-home checklist", '<ul class="pl-checks">' + sx.checks.map(function (c) {
      return '<li class="' + c.status + '"><i aria-hidden="true">' + icon[c.status] + "</i><div><b>" + App.esc(c.title) + "</b><span>" + App.esc(c.text) + "</span></div></li>";
    }).join("") + "</ul>", true);
    return h + nextBtn("Next: report");
  }

  function inspector(c, ev, it) {
    const d = def(it), row = ev.scored.find(function (r) { return r.it.uid === it.uid; }), s = row.s, zone = App.zoneById(s.zone);
    const mine = ev.issues.filter(function (i) { return i.uid === it.uid; });
    const spots = P.bestSpots(c, it, 3), best = spots[0], better = best && best.s.zone !== s.zone && best.s.total > s.total + 0.04;
    const step = ft() ? 0.5 : 0.1;
    const stepper = function (id, act, label, m) {
      return '<div class="field"><label for="' + id + '">' + label + '</label><div class="pl-step-in"><button type="button" data-act="' + act + '-dec" aria-label="Smaller ' + label + '">−</button>' +
        '<input type="number" id="' + id + '" data-act="' + act + '" value="' + uVal(m) + '" min="0.5" step="' + step + '" inputmode="decimal"><span>' + uName() + '</span>' +
        '<button type="button" data-act="' + act + '-inc" aria-label="Larger ' + label + '">+</button></div></div>';
    };
    let h = '<div class="pl-insp-top"><button type="button" class="linkbtn" data-act="deselect">← ' + TABS[st.tab][1] + "</button>" +
      '<div class="pl-insp-icons">' + (d.kind === "room" ? '<button type="button" class="icon-btn st-ib" data-act="rotate" title="Rotate (R)" aria-label="Rotate">⟳</button>' : "") +
      '<button type="button" class="icon-btn st-ib" data-act="dup" title="Duplicate (D)" aria-label="Duplicate">⧉</button>' +
      '<button type="button" class="icon-btn st-ib danger" data-act="remove" title="Delete (Del)" aria-label="Delete">🗑</button></div></div>' +
      '<section class="pl-insp"><div class="pl-insp-head"><i class="sw" style="background:' + d.color + '"></i>' +
      '<div class="field grow"><label for="pl-name">' + d.label + '</label><input type="text" id="pl-name" data-act="rename" maxlength="40" value="' + App.esc(it.n || "") + '" placeholder="' + App.esc(name(it)) + '"></div></div>' +
      '<p class="pl-zone-line"><span class="pl-zchip" style="--z:' + zone.color + '">' + zone.name + (s.zone === "C" ? " · Brahmasthan" : "") + '</span> <span class="tag ' + s.verdict.toLowerCase() + '">Vastu: ' + s.verdict + "</span></p>" +
      scoreBar("Vastu", s.vastu) + scoreBar("Climate", s.climate) + scoreBar("Overall", s.total);
    if (better) h += '<button type="button" class="btn primary pl-bestbtn" data-act="spot" data-k="0">✦ Move to its best spot · ' + App.zoneById(best.s.zone).name + " · " + pct(best.s.total) + "</button>";
    else h += '<p class="pl-ok small">✓ This is already one of its best spots.</p>';
    mine.forEach(function (i) { h += '<div class="pl-issue ' + i.sev + '"><b>' + App.esc(i.text) + "</b>" + (i.fix ? "<span>" + App.esc(i.fix) + "</span>" : "") + "</div>"; });
    if (d.kind === "room") {
      h += '<div class="pl-row2">' + stepper("pl-iw", "iw", "Width", it.w) + stepper("pl-ih", "ih", "Depth", it.h) + "</div>" +
        '<p class="small muted">' + area(it.w * it.h, true) + (d.nbc ? " · NBC minimum " + area(d.nbc[0]) + ", " + len(d.nbc[1]) + " wide" : "") + "</p>";
    }
    if (s.why) h += '<p class="small"><b>Climate:</b> ' + App.esc(s.why) + ".</p>";
    if (s.climate != null && s.climate < 0.45 && P.MITIGATION[d.sci]) h += '<p class="small pl-fix"><b>How to make it work:</b> ' + P.MITIGATION[d.sci] + "</p>";
    h += '<details class="pl-more"' + (better ? "" : " open") + '><summary>Other good places</summary><ol class="pl-spots">' + spots.map(function (sp, k) {
      const z = App.zoneById(sp.s.zone), here = sp.s.zone === s.zone;
      return '<li><span class="pl-zchip" style="--z:' + z.color + '">' + z.name + '</span><span class="tag ' + sp.s.verdict.toLowerCase() + '">' + sp.s.verdict + "</span><b>" + pct(sp.s.total) + "</b>" +
        (here ? '<span class="small muted">here</span>' : '<button type="button" class="btn sm" data-act="spot" data-k="' + k + '">Move</button>') + "</li>";
    }).join("") + "</ol></details>";
    if (st.tab === CLIMATE && metrics && d.kind === "room") h += roomClimate(strategies(), it);
    h += '<p class="small muted"><b>Vastu:</b> ' + (d.pref.length ? "best in " + P.goodZones(d).join(", ") : "") + (d.avoid.length ? "; avoid " + d.avoid.map(function (z) { return App.zoneById(z).name; }).join(", ") : "") + ".</p></section>";
    return h;
  }

  function zoneCard(id) {
    const z = App.zoneById(id), k = DIRS.indexOf(id);
    let h = '<section class="pl-sec pl-zonecard" style="--z:' + z.color + '"><h3>' + z.name + ' <span class="muted">(' + z.deity + ")</span></h3>" +
      '<p class="small">' + z.element + " · " + z.theme + "</p><p class=\"small\"><b>Good for:</b> " + z.uses.join(", ") + "<br><b>Avoid:</b> " + z.avoid + "</p>";
    if (metrics && k >= 0) {
      const r = metrics.raw;
      h += '<p class="small muted">Climate on this side: afternoon heat ' + r.pmHotSun[k].toFixed(0) + " kWh/m², morning sun " + r.amSun[k].toFixed(0) + " kWh/m², breeze from here " + Math.round(100 * r.breeze[k]) + " % of warm hours.</p>";
    }
    return h + "</section>";
  }

  function issuesBlock(issues) {
    if (!issues.length) return '<section class="pl-sec"><h3>Checks</h3><p class="pl-ok">✓ No overlaps, setback, size or Vastu problems.</p></section>';
    const label = { error: "Fix", warn: "Check", vastu: "Vastu", climate: "Climate", info: "Note" };
    return '<section class="pl-sec"><h3>Checks <span class="muted small">(' + issues.length + ')</span></h3><ul class="pl-issues">' + issues.map(function (i) {
      return '<li><button type="button" class="pl-issue ' + i.sev + '" data-act="pick" data-uid="' + (i.uid || "") + '"><em>' + label[i.sev] + "</em><b>" + App.esc(i.text) + "</b>" + (i.fix ? "<span>" + App.esc(i.fix) + "</span>" : "") + "</button></li>";
    }).join("") + "</ul></section>";
  }

  /* ---------- drawing ---------- */
  function view(strat) {
    const s = st.site, m = Math.max(s.W, s.D) * (strat ? 0.13 : 0.1) + (strat ? 1.8 : 0.8), road = Math.max(2, Math.min(s.W, s.D) * 0.12);
    return { x: -m - (s.corner === "left" ? road : 0), y: -m, w: s.W + 2 * m + (s.corner ? road : 0), h: s.D + 2 * m + road, m: m, road: road };
  }

  function rayHit(cx, cy, dx, dy, W, D) {
    let t = Infinity;
    if (dx > 1e-9) t = Math.min(t, (W - cx) / dx); else if (dx < -1e-9) t = Math.min(t, -cx / dx);
    if (dy > 1e-9) t = Math.min(t, (D - cy) / dy); else if (dy < -1e-9) t = Math.min(t, -cy / dy);
    return t;
  }

  function svgMarkup(opts) {
    opts = opts || {};
    const strat = metrics && (opts.strat || (!opts.static && st.tab === CLIMATE)) ? strategies() : null;
    const s = st.site, W = s.W, D = s.D, v = view(!!strat), b = P.buildable(s), c = ctx(), ev = P.evaluate(c, st.items);
    const fs = Math.max(0.3, Math.min(W, D) / 26), cx = W / 2, cy = D / 2, R = W + D;
    const idp = opts.static ? "plr-" : "pl-";
    const ppm = opts.static ? 1e9 : opts.ppm || 40;
    const f = function (n) { return (Math.round(n * 1000) / 1000).toString(); };
    let g = "<defs>" +
      '<pattern id="' + idp + 'hatch" width="0.6" height="0.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.6" stroke="#8d86a0" stroke-width="0.06"/></pattern>' +
      '<clipPath id="' + idp + 'clip"><rect x="0" y="0" width="' + f(W) + '" height="' + f(D) + '"/></clipPath>' +
      '<marker id="' + idp + 'arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L10 5L0 10z" fill="#1c7ed6"/></marker></defs>';
    // road(s)
    g += '<rect class="pl-road" x="' + f(-v.m * 0.4) + '" y="' + f(D + v.m * 0.35) + '" width="' + f(W + v.m * 0.8) + '" height="' + f(v.road) + '"/>' +
      '<text class="pl-roadtxt" x="' + f(cx) + '" y="' + f(D + v.m * 0.35 + v.road / 2) + '" font-size="' + f(fs * 0.85) + '">ROAD · plot faces ' + DIR_NAMES[DIRS[P.sideDir(s, "bottom")]] + "</text>";
    if (s.corner) {
      const x = s.corner === "left" ? -v.m * 0.35 - v.road : W + v.m * 0.35;
      g += '<rect class="pl-road" x="' + f(x) + '" y="' + f(-v.m * 0.4) + '" width="' + f(v.road) + '" height="' + f(D + v.m * 0.75 + v.road) + '"/>' +
        '<text class="pl-roadtxt" transform="translate(' + f(x + v.road / 2) + " " + f(cy) + ') rotate(-90)" font-size="' + f(fs * 0.85) + '">ROAD</text>';
    }
    // climate edges
    if (metrics && st.show.climate && !strat) {
      const band = Math.max(0.25, v.m * 0.16), gap = v.m * 0.08;
      [["top", 0, -gap - band, W, band], ["bottom", 0, D + gap, W, band], ["left", -gap - band, 0, band, D], ["right", W + gap, 0, band, D]].forEach(function (e) {
        const k = P.sideDir(s, e[0]), heat = metrics.norm.pmHotSun[k];
        g += '<rect class="pl-heat" x="' + f(e[1]) + '" y="' + f(e[2]) + '" width="' + f(e[3]) + '" height="' + f(e[4]) + '" fill-opacity="' + (0.08 + 0.82 * heat).toFixed(2) + '"><title>' + DIR_NAMES[DIRS[k]] + " side: afternoon sun in hot hours " + metrics.raw.pmHotSun[k].toFixed(0) + " kWh/m² a year</title></rect>";
      });
      const bk = metrics.raw.breeze.indexOf(Math.max.apply(null, metrics.raw.breeze));
      const bb = P.bearingOfAz(s, bk * 45) * Math.PI / 180, dx = Math.sin(bb), dy = -Math.cos(bb);
      const t = rayHit(cx, cy, dx, dy, W, D), r0 = t + v.m * 0.95, r1 = t + v.m * 0.3;
      g += '<g class="pl-wind"><title>Prevailing breeze in warm hours: from the ' + DIR_NAMES[DIRS[bk]] + " (" + Math.round(100 * metrics.raw.breeze[bk]) + ' % of warm hours)</title><line x1="' + f(cx + dx * r0) + '" y1="' + f(cy + dy * r0) + '" x2="' + f(cx + dx * r1) + '" y2="' + f(cy + dy * r1) + '" stroke-width="' + f(fs * 0.3) + '" marker-end="url(#' + idp + 'arrow)"/>' +
        '<text x="' + f(cx + dx * (r0 + fs * 0.9)) + '" y="' + f(cy + dy * (r0 + fs * 0.9)) + '" font-size="' + f(fs * 0.75) + '">breeze</text></g>';
    }
    // plot
    g += '<rect class="pl-plot" x="0" y="0" width="' + f(W) + '" height="' + f(D) + '"/>';
    if (st.underlay && !opts.static) {
      const ib = st.underlayFit === "building" ? b : { x0: 0, y0: 0, x1: W, y1: D };
      g += '<image href="' + st.underlay + '" x="' + f(ib.x0) + '" y="' + f(ib.y0) + '" width="' + f(ib.x1 - ib.x0) + '" height="' + f(ib.y1 - ib.y0) + '" preserveAspectRatio="none" opacity="' + st.underlayOpacity + '"/>';
    }
    // zones
    if (st.show.zones || (opts.static && !strat)) {
      g += '<g clip-path="url(#' + idp + 'clip)" class="pl-zones' + (strat ? " faint" : "") + '">';
      Z.forEach(function (z) {
        const pts = [[cx, cy]];
        for (let a = -22.5; a <= 22.51; a += 11.25) {
          const br = P.bearingOfAz(s, z.az + a) * Math.PI / 180;
          pts.push([cx + R * Math.sin(br), cy - R * Math.cos(br)]);
        }
        g += '<polygon points="' + pts.map(function (p) { return f(p[0]) + "," + f(p[1]); }).join(" ") + '" fill="' + z.color + '" class="' + (st.zoneInfo === z.id ? "on" : "") + '"/>';
      });
      g += '<rect class="pl-brahma' + (st.zoneInfo === "C" ? " on" : "") + '" fill="url(#' + idp + 'hatch)" x="' + f(W / 3) + '" y="' + f(D / 3) + '" width="' + f(W / 3) + '" height="' + f(D / 3) + '"/></g>';
      Z.forEach(function (z) {
        const br = P.bearingOfAz(s, z.az) * Math.PI / 180, dx = Math.sin(br), dy = -Math.cos(br), t = rayHit(cx, cy, dx, dy, W, D) - fs * 1.1;
        g += '<text class="pl-zlabel" x="' + f(cx + dx * t) + '" y="' + f(cy + dy * t) + '" font-size="' + f(fs * 0.95) + '">' + z.id + "</text>";
      });
      g += '<text class="pl-zlabel c" x="' + f(cx) + '" y="' + f(cy) + '" font-size="' + f(fs * 0.7) + '">Brahmasthan</text>';
    }
    g += '<rect class="pl-build" x="' + f(b.x0) + '" y="' + f(b.y0) + '" width="' + f(b.x1 - b.x0) + '" height="' + f(b.y1 - b.y0) + '"/>';
    // plot dimensions
    if ((st.show.dims || opts.static) && !strat) {
      g += '<text class="pl-dim" x="' + f(cx) + '" y="' + f(-v.m * 0.45) + '" font-size="' + f(fs * 0.8) + '">' + len(W) + "</text>" +
        '<text class="pl-dim" transform="translate(' + f(W + v.m * (s.corner === "right" ? 0.2 : 0.55)) + " " + f(cy) + ') rotate(90)" font-size="' + f(fs * 0.8) + '">' + len(D) + "</text>";
    }
    // items: rooms first, then fixtures and doors; selected on top
    const scoreOf = {};
    ev.scored.forEach(function (r) { scoreOf[r.it.uid] = r.s; });
    const bad = {};
    ev.issues.forEach(function (i) { if (i.uid && (i.sev === "error" || i.sev === "warn")) bad[i.uid] = true; });
    const order = st.items.slice().sort(function (a, d) {
      const ka = def(a).kind === "room" ? 0 : 1, kd = def(d).kind === "room" ? 0 : 1;
      return ka - kd || (a.uid === st.sel) - (d.uid === st.sel);
    });
    const shown = P.numbered(st.items), autoName = {};
    shown.forEach(function (x) { autoName[x.uid] = x.auto; });
    order.forEach(function (it) {
      const d = def(it), sc = scoreOf[it.uid], sel = it.uid === st.sel && !opts.static, nm = it.n || autoName[it.uid] || d.short;
      const vcls = sc.verdict === "Preferred" ? "good" : sc.verdict === "Avoid" ? "bad" : "ok";
      const aria = App.esc(nm + ", " + App.zoneById(sc.zone).name + " zone, Vastu " + sc.verdict + ", overall " + pct(sc.total));
      if (d.kind === "room") {
        let fz = Math.min(fs, it.w / Math.max(4, nm.length * 0.62), it.h / 2.4);
        if (sel) fz = Math.max(fz, 10 / ppm);
        const showName = fz * ppm >= 8.5, showDims = (st.show.dims || opts.static) && showName && fz * 0.72 * ppm >= 7.5 && it.h * ppm > 36;
        g += '<g class="pl-item room' + (sel ? " sel" : "") + (bad[it.uid] ? " err" : "") + '" data-uid="' + it.uid + '"' + (opts.static ? "" : ' tabindex="0" role="button" aria-label="' + aria + '"') + ">" +
          '<rect x="' + f(it.x) + '" y="' + f(it.y) + '" width="' + f(it.w) + '" height="' + f(it.h) + '" fill="' + d.color + '"/>' +
          '<title>' + aria + '</title>' +
          (showName ? '<text class="pl-rname" x="' + f(it.x + it.w / 2) + '" y="' + f(it.y + it.h / 2 - (showDims ? fz * 0.35 : 0)) + '" font-size="' + f(fz) + '">' + App.esc(nm) + "</text>" : "") +
          (showDims ? '<text class="pl-rdim" x="' + f(it.x + it.w / 2) + '" y="' + f(it.y + it.h / 2 + fz * 0.85) + '" font-size="' + f(fz * 0.72) + '">' + len(it.w) + " × " + len(it.h) + "</text>" : "") +
          '<circle class="pl-vdot ' + vcls + '" cx="' + f(it.x + it.w - Math.min(0.35, it.w / 6)) + '" cy="' + f(it.y + Math.min(0.35, it.h / 6)) + '" r="' + f(Math.min(0.2, it.w / 10, it.h / 10)) + '"/>';
        if (sel) ["nw", "ne", "sw", "se"].forEach(function (hk) {
          const hx = hk[1] === "w" ? it.x : it.x + it.w, hy = hk[0] === "n" ? it.y : it.y + it.h, hs = Math.max(fs * 0.5, (opts.coarse ? 22 : 12) / ppm);
          g += '<rect class="pl-handle" data-h="' + hk + '" x="' + f(hx - hs / 2) + '" y="' + f(hy - hs / 2) + '" width="' + f(hs) + '" height="' + f(hs) + '"/>';
        });
        g += "</g>";
      } else if (d.kind === "door") {
        const side = P.doorSide(s, it, fp()), half = 0.5, horiz = side === "top" || side === "bottom";
        const x0 = horiz ? it.x - half : it.x, x1 = horiz ? it.x + half : it.x, y0 = horiz ? it.y : it.y - half, y1 = horiz ? it.y : it.y + half;
        const inward = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[side];
        const sx = x0 + inward[0] * 1, sy = y0 + inward[1] * 1;
        g += '<g class="pl-item door' + (sel ? " sel" : "") + (bad[it.uid] ? " err" : "") + '" data-uid="' + it.uid + '"' + (opts.static ? "" : ' tabindex="0" role="button" aria-label="' + aria + '"') + ">" +
          '<rect class="pl-hit" x="' + f(Math.min(x0, x1) - 0.6) + '" y="' + f(Math.min(y0, y1) - 0.6) + '" width="' + f(Math.abs(x1 - x0) + 1.2) + '" height="' + f(Math.abs(y1 - y0) + 1.2) + '"/>' +
          '<path class="pl-swing" d="M' + f(x0) + " " + f(y0) + " L" + f(sx) + " " + f(sy) + " A1 1 0 0 " + (side === "bottom" || side === "left" ? 1 : 0) + " " + f(x1) + " " + f(y1) + '"/>' +
          '<line class="pl-doorline" x1="' + f(x0) + '" y1="' + f(y0) + '" x2="' + f(x1) + '" y2="' + f(y1) + '" stroke-width="' + f(fs * 0.35) + '"/>' +
          '<circle class="pl-vdot ' + vcls + '" cx="' + f(it.x + inward[0] * 1.4) + '" cy="' + f(it.y + inward[1] * 1.4) + '" r="0.2"/>' +
          '<text class="pl-ftxt" x="' + f(it.x - inward[0] * fs * 1.1) + '" y="' + f(it.y - inward[1] * fs * 1.1) + '" font-size="' + f(fs * 0.7) + '">Entrance</text></g>';
      } else {
        const r = Math.max(0.25, fs * 0.42);
        g += '<g class="pl-item fixture' + (sel ? " sel" : "") + '" data-uid="' + it.uid + '"' + (opts.static ? "" : ' tabindex="0" role="button" aria-label="' + aria + '"') + ">" +
          '<circle cx="' + f(it.x) + '" cy="' + f(it.y) + '" r="' + f(r) + '" fill="' + d.color + '"/>' +
          '<circle class="pl-vdot ' + vcls + '" cx="' + f(it.x + r * 0.75) + '" cy="' + f(it.y - r * 0.75) + '" r="' + f(r * 0.32) + '"/>' +
          '<title>' + aria + '</title>' +
          (sel || fs * 0.62 * ppm >= 9 ? '<text class="pl-ftxt" x="' + f(it.x) + '" y="' + f(it.y + r + fs * 0.6) + '" font-size="' + f(Math.max(fs * 0.62, 10 / ppm)) + '">' + App.esc(nm) + "</text>" : "") + "</g>";
      }
    });
    if (strat) g += strategyLayer(strat, { W: W, D: D, b: b, v: v, fs: fs, f: f, idp: idp, static: opts.static, ppm: ppm });
    // tracing: box being drawn
    if (drag && drag.mode === "draw" && drag.rect && !opts.static) {
      const r = drag.rect;
      g += '<rect class="pl-ghost" x="' + f(r.x) + '" y="' + f(r.y) + '" width="' + f(r.w) + '" height="' + f(r.h) + '"/>' +
        '<text class="pl-rdim" x="' + f(r.x + r.w / 2) + '" y="' + f(r.y + r.h / 2) + '" font-size="' + f(fs * 0.8) + '">' + len(r.w) + " × " + len(r.h) + "</text>";
    }
    // compass
    const cr = Math.min(v.m * 0.36, Math.max(W, D) * 0.08), ccx = W + v.m * 0.5 + (s.corner === "right" ? v.road : 0) - cr * 0.2, ccy = -v.m * 0.5;
    g += '<g class="pl-compass" transform="translate(' + f(Math.min(ccx, v.x + v.w - cr * 1.1)) + " " + f(ccy) + ')"><circle r="' + f(cr) + '"/>' +
      '<g transform="rotate(' + P.theta(s) + ')"><path d="M0 ' + f(-cr * 0.85) + " L" + f(cr * 0.28) + " " + f(cr * 0.2) + " L0 0 L" + f(-cr * 0.28) + " " + f(cr * 0.2) + 'Z"/>' +
      '<text y="' + f(cr * 0.75) + '" font-size="' + f(cr * 0.5) + '">N</text></g></g>';
    return { body: g, vb: f(v.x) + " " + f(v.y) + " " + f(v.w) + " " + f(v.h) };
  }

  // Climate strategies drawn on the plan: wall colours by exposure with material labels,
  // chajjas to scale, breeze inlets / outlets, stack vent and planting.
  const HEAT_COLOR = { high: "#e03131", mid: "#f08c00", low: "#2f9e44" };
  function strategyLayer(sx, o) {
    const s = st.site, W = o.W, D = o.D, b = sx.footprint, v = o.v, fs = o.fs * 1.25, f = o.f;
    const out = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };
    let g = '<g class="pl-strat">';
    const bySide = {};
    sx.sides.forEach(function (x) { bySide[x.side] = x; });
    const rooms = st.items.filter(function (it) { return def(it).kind === "room"; });
    // chajjas: drawn to scale outside the building line
    if (st.show.shade || o.static) sx.sides.forEach(function (x) {
      const dpt = x.shade.depth / 1000, n = out[x.side];
      const r = x.side === "top" ? [b.x0, b.y0 - dpt, b.x1 - b.x0, dpt] : x.side === "bottom" ? [b.x0, b.y1, b.x1 - b.x0, dpt]
        : x.side === "left" ? [b.x0 - dpt, b.y0, dpt, b.y1 - b.y0] : [b.x1, b.y0, dpt, b.y1 - b.y0];
      g += '<rect class="pl-chajja" x="' + f(r[0]) + '" y="' + f(r[1]) + '" width="' + f(r[2]) + '" height="' + f(r[3]) + '"><title>' + x.dirName + ": " + App.esc(x.shade.text) + "</title></rect>";
      if (x.shade.kind === "fins") {
        const fl = (x.shade.fins || 600) / 1000, horiz = x.side === "top" || x.side === "bottom";
        const L = horiz ? b.x1 - b.x0 : b.y1 - b.y0, nF = Math.max(2, Math.floor(L / 1.5));
        for (let i = 1; i < nF; i++) {
          const t = (horiz ? b.x0 : b.y0) + i * L / nF, base = x.side === "top" ? b.y0 : x.side === "bottom" ? b.y1 : x.side === "left" ? b.x0 : b.x1;
          g += horiz ? '<line class="pl-fin" x1="' + f(t) + '" y1="' + f(base) + '" x2="' + f(t) + '" y2="' + f(base + n[1] * fl) + '"/>'
            : '<line class="pl-fin" x1="' + f(base) + '" y1="' + f(t) + '" x2="' + f(base + n[0] * fl) + '" y2="' + f(t) + '"/>';
        }
      }
    });
    // planting
    if (st.show.trees || o.static) sx.sides.forEach(function (x) {
      const n = out[x.side], horiz = x.side === "top" || x.side === "bottom";
      const sb = { top: s.set.rear, bottom: s.set.front, left: s.set.left, right: s.set.right }[x.side];
      const edge = x.side === "top" ? 0 : x.side === "bottom" ? D : x.side === "left" ? 0 : W;
      // trees sit in the setback when it is wide enough, otherwise on the boundary line
      const r = Math.max(0.6, Math.min(1.3, Math.max(sb, 1) * 0.6)), off = sb >= 2 * r ? -Math.min(sb / 2, 2.5) : r * 0.35;
      const pos = edge + (horiz ? n[1] : n[0]) * off;
      if (x.plant.kind === "shade" || x.plant.kind === "deciduous") {
        const L = horiz ? W : D, nT = Math.max(2, Math.min(4, Math.round(L / 5)));
        for (let i = 0; i < nT; i++) {
          const t = (i + 0.5) * L / nT, cx = horiz ? t : pos, cy = horiz ? pos : t;
          g += '<g class="pl-tree ' + x.plant.kind + '"><title>' + App.esc(x.plant.text) + '</title><circle cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r) + '"/><circle class="trunk" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(r * 0.15) + '"/></g>';
        }
      } else if (x.plant.kind === "hedge") {
        g += horiz ? '<line class="pl-hedge" x1="0.3" y1="' + f(pos) + '" x2="' + f(W - 0.3) + '" y2="' + f(pos) + '"><title>' + App.esc(x.plant.text) + "</title></line>"
          : '<line class="pl-hedge" x1="' + f(pos) + '" y1="0.3" x2="' + f(pos) + '" y2="' + f(D - 0.3) + '"><title>' + App.esc(x.plant.text) + "</title></line>";
      }
    });
    // walls: each room's outside walls, coloured by exposure and drawn at the recommended thickness
    if (st.show.mat || o.static) rooms.forEach(function (it) {
      P.facades(s, it, null, sx.footprint).forEach(function (fc) {
        const x = bySide[fc.side], t = Math.max(x.wall.mm / 1000, 3 / (o.ppm || 40));
        const seg = fc.side === "top" ? [it.x, it.y, it.x + it.w, it.y] : fc.side === "bottom" ? [it.x, it.y + it.h, it.x + it.w, it.y + it.h]
          : fc.side === "left" ? [it.x, it.y, it.x, it.y + it.h] : [it.x + it.w, it.y, it.x + it.w, it.y + it.h];
        g += '<line class="pl-wall" x1="' + f(seg[0]) + '" y1="' + f(seg[1]) + '" x2="' + f(seg[2]) + '" y2="' + f(seg[3]) + '" stroke="' + HEAT_COLOR[x.heat] + '" stroke-width="' + f(t) + '"><title>' + x.dirName + " wall, " + x.wall.mm + " mm: " + App.esc(x.wall.build) + "</title></line>";
      });
    });
    // airflow: the breeze crossing the house from each inlet window to the leeward side, plus arrows
    // into the inlets and out of the outlets, and the stack vent at the centre
    if (st.show.vent || o.static) {
      const fpb = sx.footprint, ww = sx.vent.windward;
      if (ww && sx.vent.leeward === { top: "bottom", bottom: "top", left: "right", right: "left" }[ww]) {
        const n = out[ww];
        sx.windows.filter(function (w) { return w.role === "inlet"; }).forEach(function (w) {
          const x1 = n[0] ? (n[0] < 0 ? fpb.x1 : fpb.x0) : w.x, y1 = n[1] ? (n[1] < 0 ? fpb.y1 : fpb.y0) : w.y;
          g += '<line class="pl-flow" x1="' + f(w.x) + '" y1="' + f(w.y) + '" x2="' + f(x1) + '" y2="' + f(y1) + '" stroke-width="' + f(fs * 0.12) + '"/>';
        });
      }
      sx.windows.forEach(function (w) {
        if (w.role !== "inlet" && w.role !== "outlet") return;
        const n = out[w.side], Lr = Math.max(0.9, fs * 2), inward = w.role === "inlet";
        const x0 = inward ? w.x + n[0] * Lr : w.x, y0 = inward ? w.y + n[1] * Lr : w.y;
        const x1 = inward ? w.x - n[0] * Lr * 0.4 : w.x + n[0] * Lr, y1 = inward ? w.y - n[1] * Lr * 0.4 : w.y + n[1] * Lr;
        g += '<line class="pl-vent ' + (inward ? "in" : "out") + '" x1="' + f(x0) + '" y1="' + f(y0) + '" x2="' + f(x1) + '" y2="' + f(y1) + '" stroke-width="' + f(fs * 0.22) + '" marker-end="url(#' + o.idp + 'arrow)"><title>' + (inward ? "Breeze in: smaller, lower inlet window" : "Breeze out: larger, higher outlet window") + "</title></line>";
      });
      if (sx.vent.stack) {
        const r = Math.min(W, D) / 9;
        g += '<g class="pl-stack"><title>Stack vent: courtyard, double-height hall or skylight with high openable vents</title><circle cx="' + f(W / 2) + '" cy="' + f(D / 2) + '" r="' + f(r) + '"/>' +
          '<text x="' + f(W / 2) + '" y="' + f(D / 2) + '" font-size="' + f(fs * 0.62) + '">↑ hot air out</text></g>';
      }
    }
    // windows and ventilators, to scale, on the walls they belong to
    if (st.show.win || o.static) sx.windows.forEach(function (w) {
      const x = bySide[w.side], t = Math.max(x.wall.mm / 1000, 3 / (o.ppm || 40)) + 0.06;
      const rx = w.horiz ? w.x - w.width / 2 : w.x - t / 2, ry = w.horiz ? w.y - t / 2 : w.y - w.width / 2, rw = w.horiz ? w.width : t, rh = w.horiz ? t : w.width;
      const kind = { inlet: "Inlet window", outlet: "Outlet window", window: "Window", high: "High window", vent: "Ventilator" }[w.role];
      g += '<g class="pl-win ' + w.role + '"><title>' + kind + " on the " + x.dirName + " wall: " + w.width.toFixed(2) + " m wide × " + w.height.toFixed(2) + " m high, sill " + w.sill.toFixed(2) + ' m</title>' +
        '<rect x="' + f(rx) + '" y="' + f(ry) + '" width="' + f(rw) + '" height="' + f(rh) + '"/>' +
        (w.horiz ? '<line x1="' + f(rx) + '" y1="' + f(w.y) + '" x2="' + f(rx + rw) + '" y2="' + f(w.y) + '"/>' : '<line x1="' + f(w.x) + '" y1="' + f(ry) + '" x2="' + f(w.x) + '" y2="' + f(ry + rh) + '"/>') + "</g>";
      if (w.width * (o.ppm || 40) > 34 && !o.static) {
        const n = out[w.side], d = t / 2 + fs * 0.55;
        g += '<text class="pl-wlabel" x="' + f(w.x + n[0] * d) + '" y="' + f(w.y + n[1] * d) + '" font-size="' + f(Math.max(fs * 0.5, 9 / (o.ppm || 40))) + '">' + len(w.width) + "</text>";
      }
    });
    // labels outside each side
    sx.sides.forEach(function (x) {
      const parts = [x.dir + " · " + HEAT[x.heat]];
      if (st.show.mat || o.static) parts.push(x.wall.short);
      const l2 = st.show.shade || o.static ? x.shade.short + (x.shade.kind === "none" ? "" : " mm") : "";
      const t1 = parts.join(" · "), gap = v.m * 0.42;
      let tr;
      if (x.side === "top") tr = "translate(" + f(W / 2) + " " + f(-gap) + ")";
      else if (x.side === "bottom") tr = "translate(" + f(W / 2) + " " + f(D + gap * 0.62) + ")";
      else if (x.side === "left") tr = "translate(" + f(-gap) + " " + f(D / 2) + ") rotate(-90)";
      else tr = "translate(" + f(W + gap) + " " + f(D / 2) + ") rotate(90)";
      g += '<g class="pl-slabel" transform="' + tr + '"><text y="' + f(-fs * 0.45) + '" font-size="' + f(fs * 0.78) + '" fill="' + HEAT_COLOR[x.heat] + '">' + App.esc(t1) + "</text>" +
        (l2 ? '<text class="sub" y="' + f(fs * 0.55) + '" font-size="' + f(fs * 0.66) + '">' + App.esc(l2.replace(/^chajja /, "chajja ")) + "</text>" : "") + "</g>";
    });
    if (o.static) g += '<text class="pl-roofnote" x="' + f(-v.m * 0.9) + '" y="' + f(-v.m * 0.78) + '" font-size="' + f(fs * 0.7) + '">Roof: ' + App.esc(sx.roof.short) + "</text>";
    return g + "</g>";
  }

  /* ---------- camera ---------- */
  function stratOn() { return !!(metrics && st.tab === CLIMATE); }
  // The fitted view: the whole plot centred in the part of the stage that is not covered
  // by the phone's bottom sheet, with the viewBox matching the stage's aspect ratio.
  function baseVb() {
    const v = view(stratOn()), svg = root && App.$("#pl-svg", root);
    const W = (svg && svg.clientWidth) || 0, H = (svg && svg.clientHeight) || 0;
    if (!W || !H) return { x: v.x, y: v.y, w: v.w, h: v.h };
    const cover = mobile() ? { peek: 64, half: H * 0.46, full: H * 0.46 }[st.sheet] : 0;
    const Hv = Math.max(120, H - cover - 8), sc = Math.min(W / v.w, Hv / v.h);
    const w = W / sc, h = H / sc;
    return { x: v.x - (w - v.w) / 2, y: v.y - (Hv / sc - v.h) / 2, w: w, h: h };
  }
  function cam() { return st.vb || baseVb(); }
  function zoomLevel() { return baseVb().w / cam().w; }
  function zoomAt(f, px, py) {
    const c = cam(), b = baseVb();
    if (px == null) { px = c.x + c.w / 2; py = c.y + c.h / 2; }
    const nw = clamp(c.w / f, b.w / 10, b.w * 1.25), k = nw / c.w;
    st.vb = { x: px - (px - c.x) * k, y: py - (py - c.y) * k, w: nw, h: c.h * k };
    if (Math.abs(nw - b.w) / b.w < 0.02 && Math.abs(st.vb.x - b.x) < b.w * 0.02) st.vb = null;
    renderCanvas(); renderFloat();
  }
  function fit() { st.vb = null; renderCanvas(); renderFloat(); }
  function ppmNow() {
    const svg = App.$("#pl-svg", root), c = cam();
    const w = svg.clientWidth || 600, h = svg.clientHeight || 400;
    return Math.min(w / c.w, h / c.h);
  }

  function renderCanvas() {
    const svg = App.$("#pl-svg", root), focusUid = document.activeElement && document.activeElement.closest && document.activeElement.closest("#pl-svg [data-uid]");
    const keep = focusUid ? focusUid.dataset.uid : null;
    const m = svgMarkup({ ppm: ppmNow(), coarse: window.matchMedia("(pointer: coarse)").matches }), c = cam();
    svg.setAttribute("viewBox", [c.x, c.y, c.w, c.h].map(function (n) { return Math.round(n * 1000) / 1000; }).join(" "));
    svg.classList.toggle("tracing", !!st.tool);
    svg.innerHTML = m.body;
    if (keep) { const el = svg.querySelector('[data-uid="' + keep + '"]'); if (el) el.focus({ preventScroll: true }); }
  }

  /* ---------- pointer editing ---------- */
  function svgPoint(e) {
    const svg = App.$("#pl-svg", root), pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function pxToUnits(px) { const svg = App.$("#pl-svg", root), m = svg.getScreenCTM(); return px / (m ? m.a : 1); }
  function gridStep() { return ft() ? FT / 2 : 0.1; }
  function snapV(v) { const g = gridStep(); return Math.round(v / g) * g; }

  // Snap an edge coordinate to nearby edges of the plot, the building line and other rooms.
  function edgeTargets(axis, skip) {
    const s = st.site, b = P.buildable(s), out = axis === "x" ? [0, s.W, b.x0, b.x1] : [0, s.D, b.y0, b.y1];
    st.items.forEach(function (o) {
      if (o.uid === skip || def(o).kind !== "room") return;
      if (axis === "x") out.push(o.x, o.x + o.w); else out.push(o.y, o.y + o.h);
    });
    return out;
  }
  function snapEdges(a0, a1, targets, tol) {
    let best = null;
    targets.forEach(function (t) {
      [[a0, 0], [a1, 1]].forEach(function (e) { const d = t - e[0]; if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best))) best = d; });
    });
    return best;
  }

  function onDown(e) {
    if (e.button && e.button !== 0) return;
    const svg = App.$("#pl-svg", root), h = e.target.closest("[data-h]"), g = e.target.closest("[data-uid]");
    const p = svgPoint(e), s0 = st.site;
    closePop();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // second finger: pinch to zoom (an item drag in progress is dropped where it is)
    if (pointers.size === 2) {
      const pts = Array.from(pointers.values()), c = cam();
      drag = { mode: "pinch", d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), m0: { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }, vb0: Object.assign({}, c), scale0: ppmNow() };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    if (st.tool) {
      // tracing: drag a box for a room, tap to place a door or tank
      e.preventDefault();
      const t = App.VASTU_ROOM[st.tool], px = clamp(snapV(p.x), 0, s0.W), py = clamp(snapV(p.y), 0, s0.D);
      if (t.kind === "room") {
        drag = { mode: "draw", p0: { x: px, y: py }, rect: null, moved: false };
        svg.setPointerCapture(e.pointerId);
      } else {
        change(function () {
          const n = P.newItem(st.tool);
          n.x = px; n.y = py;
          if (t.kind === "door") Object.assign(n, P.snapDoor(s0, n, fp()));
          st.items.push(n); // tracing stays in the palette; the new item is not selected
        });
      }
      return;
    }
    e.preventDefault();
    if (!g) {
      // empty ground: drag to pan, a plain click shows what the zone is for
      drag = { mode: "pan", cx0: e.clientX, cy0: e.clientY, vb0: Object.assign({}, cam()), scale0: ppmNow(), p: p, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const it = find(g.dataset.uid);
    const was = st.sel;
    st.sel = it.uid; st.zoneInfo = null;
    drag = { uid: it.uid, mode: h ? h.dataset.h : "move", p0: p, o: Object.assign({}, it), before: snapshot(), moved: false };
    svg.setPointerCapture(e.pointerId);
    if (was !== it.uid) { if (mobile() && st.sheet === "peek") st.sheet = "half"; renderAll(); }
  }

  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!drag) return;
    if (drag.mode === "pinch") {
      const pts = Array.from(pointers.values());
      if (pts.length < 2) return;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), f = clamp(d / drag.d0, 0.2, 10);
      const b = baseVb(), v0 = drag.vb0, nw = clamp(v0.w / f, b.w / 10, b.w * 1.25), k = nw / v0.w;
      const svg = App.$("#pl-svg", root), r = svg.getBoundingClientRect();
      // keep the point under the starting midpoint under the fingers' current midpoint
      const mx = v0.x + (drag.m0.x - r.left) / drag.scale0, my = v0.y + (drag.m0.y - r.top) / drag.scale0;
      const cxn = (pts[0].x + pts[1].x) / 2, cyn = (pts[0].y + pts[1].y) / 2, s1 = drag.scale0 / k;
      st.vb = { x: mx - (cxn - r.left) / s1, y: my - (cyn - r.top) / s1, w: nw, h: v0.h * k };
      renderCanvas(); renderFloat();
      return;
    }
    if (drag.mode === "pan") {
      const dx = e.clientX - drag.cx0, dy = e.clientY - drag.cy0;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      drag.moved = true;
      st.vb = { x: drag.vb0.x - dx / drag.scale0, y: drag.vb0.y - dy / drag.scale0, w: drag.vb0.w, h: drag.vb0.h };
      App.$("#pl-svg", root).setAttribute("viewBox", [st.vb.x, st.vb.y, st.vb.w, st.vb.h].join(" "));
      return;
    }
    if (drag.mode === "draw") {
      const p = svgPoint(e), s = st.site, x = clamp(snapV(p.x), 0, s.W), y = clamp(snapV(p.y), 0, s.D);
      drag.rect = { x: round2(Math.min(x, drag.p0.x)), y: round2(Math.min(y, drag.p0.y)), w: round2(Math.abs(x - drag.p0.x)), h: round2(Math.abs(y - drag.p0.y)) };
      drag.moved = true;
      renderCanvas();
      return;
    }
    const p = svgPoint(e), it = find(drag.uid), o = drag.o, s = st.site, d = def(it);
    let dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
    if (!drag.moved && Math.hypot(dx, dy) < pxToUnits(4)) return;
    drag.moved = true;
    const tol = pxToUnits(9);
    if (d.kind === "door") { Object.assign(it, P.snapDoor(s, { x: o.x + dx, y: o.y + dy }, fp())); }
    else if (d.kind === "fixture") { it.x = clamp(snapV(o.x + dx), 0, s.W); it.y = clamp(snapV(o.y + dy), 0, s.D); }
    else if (drag.mode === "move") {
      let x = snapV(o.x + dx), y = snapV(o.y + dy);
      if (!e.altKey) {
        const sx = snapEdges(x, x + o.w, edgeTargets("x", it.uid), tol), sy = snapEdges(y, y + o.h, edgeTargets("y", it.uid), tol);
        if (sx != null) x += sx; if (sy != null) y += sy;
      }
      it.x = clamp(x, 0, s.W - o.w); it.y = clamp(y, 0, s.D - o.h);
    } else {
      const min = 0.9;
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      const tx = edgeTargets("x", it.uid), ty = edgeTargets("y", it.uid);
      const sn = function (v, targets) { v = snapV(v); if (e.altKey) return v; const k = snapEdges(v, v, targets, tol); return k == null ? v : v + k; };
      if (drag.mode[1] === "w") x0 = Math.min(sn(o.x + dx, tx), x1 - min); else x1 = Math.max(sn(o.x + o.w + dx, tx), x0 + min);
      if (drag.mode[0] === "n") y0 = Math.min(sn(o.y + dy, ty), y1 - min); else y1 = Math.max(sn(o.y + o.h + dy, ty), y0 + min);
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(s.W, x1); y1 = Math.min(s.D, y1);
      it.x = round2(x0); it.y = round2(y0); it.w = round2(x1 - x0); it.h = round2(y1 - y0); it.area = it.w * it.h;
    }
    renderCanvas(); renderBar();
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (!drag) return;
    const dd = drag;
    if (dd.mode === "pinch") { if (pointers.size < 2) drag = null; renderCanvas(); renderFloat(); return; }
    drag = null;
    if (dd.mode === "pan") {
      if (!dd.moved) {
        const s = st.site, p = dd.p, had = st.sel;
        st.sel = null;
        st.zoneInfo = p.x >= 0 && p.y >= 0 && p.x <= s.W && p.y <= s.D ? P.zoneAt(s, p.x, p.y) : null;
        if (st.zoneInfo && st.tab !== ROOMS && !had) st.zoneInfo = st.tab === PLOT ? null : st.zoneInfo;
        renderAll();
      } else { renderCanvas(); renderFloat(); }
      return;
    }
    if (dd.mode === "draw") {
      const r = dd.rect;
      if (r && r.w >= 0.6 && r.h >= 0.6) {
        change(function () {
          const n = P.newItem(st.tool);
          Object.assign(n, r, { area: r.w * r.h });
          st.items.push(n);
        });
      } else renderCanvas();
      return;
    }
    if (dd.moved) {
      st.hist.push(dd.before); if (st.hist.length > 80) st.hist.shift();
      st.fut = []; st.touched = true; save();
    }
    renderAll();
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function round2(v) { return Math.round(v * 100) / 100; }

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (!root || !root.isConnected || App.currentView() !== "vastu" || st.tab === REPORT || st.start) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
    if (!mod && (e.key === "+" || e.key === "=")) { zoomAt(1.25); return; }
    if (!mod && (e.key === "-" || e.key === "_")) { zoomAt(0.8); return; }
    if (!mod && e.key === "0") { fit(); return; }
    if (e.key === "?") { act("help"); return; }
    if (e.key === "Escape" && (st.tool || st.pop)) { st.tool = null; st.pop = null; renderAll(); return; }
    const it = find(st.sel);
    if (!it) return;
    const step = e.shiftKey ? 0.6 : gridStep(), mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (mv) {
      e.preventDefault();
      change(function () {
        const s = st.site, d = def(it);
        if (d.kind === "door") Object.assign(it, P.snapDoor(s, { x: it.x + mv[0] * step, y: it.y + mv[1] * step }, fp()));
        else if (d.kind === "room") { it.x = round2(clamp(it.x + mv[0] * step, 0, s.W - it.w)); it.y = round2(clamp(it.y + mv[1] * step, 0, s.D - it.h)); }
        else { it.x = round2(clamp(it.x + mv[0] * step, 0, s.W)); it.y = round2(clamp(it.y + mv[1] * step, 0, s.D)); }
      });
    } else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); act("remove"); }
    else if (e.key === "r" || e.key === "R") { act("rotate"); }
    else if (e.key === "d" || e.key === "D") { act("dup"); }
    else if (e.key === "Escape") { st.sel = null; renderAll(); }
  }

  /* ---------- actions ---------- */
  function placeNew(it) {
    const spot = P.bestSpots(ctx(), it, 1)[0];
    Object.assign(it, spot.pos);
    if (def(it).kind === "door") Object.assign(it, P.snapDoor(st.site, it, fp()));
  }
  function placeAt(t, x, y) {
    change(function () {
      const n = P.newItem(t), d = App.VASTU_ROOM[t], s = st.site;
      if (d.kind === "room") { n.x = round2(clamp(snapV(x - n.w / 2), 0, s.W - n.w)); n.y = round2(clamp(snapV(y - n.h / 2), 0, s.D - n.h)); }
      else { n.x = clamp(x, 0, s.W); n.y = clamp(y, 0, s.D); if (d.kind === "door") Object.assign(n, P.snapDoor(s, n, fp())); }
      st.items.push(n); st.sel = n.uid;
    });
  }
  function closePop() { if (st.pop) { st.pop = null; renderBar(); } }
  function nudgeSize(key, dir) {
    const it = find(st.sel), s = st.site, d = (ft() ? FT / 2 : 0.1) * dir;
    if (!it || !it.w) return;
    change(function () {
      if (key === "iw") { it.w = round2(clamp(it.w + d, 0.6, s.W)); it.x = clamp(it.x, 0, s.W - it.w); }
      else { it.h = round2(clamp(it.h + d, 0.6, s.D)); it.y = clamp(it.y, 0, s.D - it.h); }
      it.area = it.w * it.h;
    });
  }
  function startPlan(items, opts) {
    opts = opts || {};
    const q = st.quick;
    st.hist.push(snapshot()); st.fut = [];
    st.site = Object.assign(P.defaultSite(), opts.keepSite ? st.site : { W: q.W * FT, D: q.D * FT, facing: q.facing });
    st.items = items; st.name = ""; st.sel = null; st.zoneInfo = null; st.vb = null; st.start = false; st.fresh = false;
    st.trace = false; st.tool = null; st.tab = ROOMS; st.sheet = "half";
    if (opts.arrange) arrange(); else st.touched = true;
    save(); renderAll();
  }

  function act(a, el) {
    const s = st.site, it = find(st.sel);
    switch (a) {
      case "tab": st.tab = +el.dataset.tab; st.sel = null; st.pop = null; if (st.tab !== ROOMS) st.zoneInfo = null; if (mobile() && st.sheet === "peek") st.sheet = "half"; renderAll(); if (st.tab === REPORT) window.scrollTo(0, 0); break;
      case "next": st.tab = Math.min(REPORT, st.tab + 1); st.sel = null; renderAll(); break;
      case "sheet": st.sheet = st.sheet === "peek" ? "half" : st.sheet === "half" ? "full" : "peek"; st.vb = null; renderAll(); break;
      case "pop": st.pop = st.pop === el.dataset.pop ? null : el.dataset.pop; renderBar(); break;
      case "undo": undo(); break;
      case "redo": redo(); break;
      case "zoom-in": zoomAt(1.3); break;
      case "zoom-out": zoomAt(1 / 1.3); break;
      case "fit": fit(); break;
      case "help":
        st.pop = null; renderBar();
        App.toast("Shortcuts: drag rooms to move · corner handles resize · arrows nudge (Shift = bigger steps) · R rotate · D duplicate · Del delete · Ctrl+Z undo · + / − zoom · 0 fit · Esc deselect. On a phone: tap a room, drag empty space to pan, pinch to zoom.", "ok");
        break;
      case "new": st.pop = null; st.start = true; st.fresh = false; renderAll(); break;
      case "start-close": st.start = false; renderAll(); break;
      case "q-preset": st.quick.preset = el.dataset.p; renderStart(); break;
      case "q-size": st.quick.W = +el.dataset.w; st.quick.D = +el.dataset.d; renderStart(); break;
      case "q-facing": st.quick.facing = +el.dataset.az; renderStart(); break;
      case "start-quick": startPlan(P.fromPreset(st.quick.preset), { arrange: true }); App.toast("Your " + App.VASTU_PRESETS.find(function (p) { return p.id === st.quick.preset; }).label + " is planned. Tap any room to see why it is there, or drag it.", "ok"); if (App.track) App.track("vastu_quick_start"); break;
      case "start-blank": startPlan([]); App.toast("Blank plot ready — add rooms with +, or drag them onto the plan.", "ok"); break;
      case "auto": change(function () { st.items = P.autoArrange(ctx(), st.items); }, { auto: true }); st.touched = false; save(); App.toast("Rooms placed in their best zones. Drag any of them to adjust.", "ok"); if (App.track) App.track("vastu_auto_arrange"); break;
      case "toggle": st.show[el.dataset.k] = !st.show[el.dataset.k]; renderCanvas(); renderFloat(); break;
      case "issues": st.pop = null; st.tab = ROOMS; st.sel = null; st.zoneInfo = null; if (mobile()) st.sheet = "full"; renderAll(); { const p = App.$(".pl-issues", root); if (p) p.scrollIntoView({ block: "start", behavior: "smooth" }); } break;
      case "units": s.units = el.dataset.u; save(); renderAll(); break;
      case "size": siteChange(function () { s.W = +el.dataset.w * FT; s.D = +el.dataset.d * FT; s.units = "ft"; }); st.vb = null; break;
      case "facing": siteChange(function () { s.facing = +el.dataset.az; }); break;
      case "preset":
        if (st.touched && !window.confirm("Replace your rooms with the " + el.textContent.replace(/\d+ items/, "") + " set?")) return;
        change(function () { st.items = P.fromPreset(el.dataset.p); arrange(); }, { auto: true }); break;
      case "inc": change(function () { const n = P.newItem(el.dataset.t); placeNew(n); st.items.push(n); if (!st.touched) arrange(); }, { auto: !st.touched }); break;
      case "dec": change(function () {
        const list = st.items.filter(function (x) { return x.t === el.dataset.t; }), gone = list[list.length - 1];
        st.items = st.items.filter(function (x) { return x !== gone; }); if (st.sel === gone.uid) st.sel = null; if (!st.touched) arrange();
      }, { auto: !st.touched }); break;
      case "rotate": if (it && def(it).kind === "room") change(function () { const w = it.w; it.w = it.h; it.h = w; it.x = round2(clamp(it.x, 0, s.W - it.w)); it.y = round2(clamp(it.y, 0, s.D - it.h)); }); break;
      case "dup": if (it) change(function () { const n = P.newItem(it.t); if (it.w) { n.w = it.w; n.h = it.h; } placeNew(n); st.items.push(n); st.sel = n.uid; }); break;
      case "remove": if (it) { const nm = name(it); change(function () { st.items = st.items.filter(function (x) { return x !== it; }); st.sel = null; }); App.toast(nm + " removed — Ctrl+Z or ↶ to undo.", "ok"); } break;
      case "deselect": st.sel = null; renderAll(); break;
      case "iw-dec": nudgeSize("iw", -1); break;
      case "iw-inc": nudgeSize("iw", 1); break;
      case "ih-dec": nudgeSize("ih", -1); break;
      case "ih-inc": nudgeSize("ih", 1); break;
      case "spot": if (it) change(function () { const sp = P.bestSpots(ctx(), it, 3)[+el.dataset.k]; Object.assign(it, sp.pos); if (def(it).kind === "door") Object.assign(it, P.snapDoor(s, it, fp())); }); break;
      case "pick": if (el.dataset.uid) { st.sel = el.dataset.uid; renderAll(); const g = App.$('#pl-svg [data-uid="' + el.dataset.uid + '"]', root); if (g) g.focus({ preventScroll: true }); } break;
      case "loc-open": st.locOpen = true; renderPanel(); { const c = App.$("#pl-city", root); if (c) c.focus(); } break;
      case "loc-close": st.locOpen = false; renderPanel(); break;
      case "loc-go": locate(App.$("#pl-city", root).value); break;
      case "loc-near": near(); break;
      case "underlay-clear": st.underlay = null; storeImage(); renderAll(); break;
      case "trace-start":
        if (st.items.length && window.confirm("Start from an empty plot? OK removes the current rooms; Cancel keeps them so you can adjust them instead.")) {
          change(function () { st.items = []; st.sel = null; });
        }
        st.trace = true; st.tool = "living"; st.touched = true; st.tab = ROOMS; st.sel = null; st.show.zones = false;
        if (App.track) App.track("vastu_trace_start");
        renderAll(); break;
      case "tool": st.tool = st.tool === el.dataset.t ? null : el.dataset.t; renderPanel(); renderCanvas(); renderFloat(); if (mobile() && st.tool) { st.sheet = "peek"; renderAll(); } break;
      case "trace-done": st.trace = false; st.tool = null; st.show.zones = true; renderAll(); App.toast("Plan traced — " + st.items.length + " items. Check the scores, then see the climate strategies.", "ok"); break;
      case "trace-climate": st.trace = false; st.tool = null; st.tab = CLIMATE; renderAll(); break;
      case "print": if (App.track) App.track("vastu_print"); window.print(); break;
      case "share": st.pop = null; renderBar(); share(); break;
      case "json": st.pop = null; renderBar(); download((st.name || "vastu-plan").replace(/[^\w-]+/g, "-") + ".json", JSON.stringify(Object.assign({ app: "trikrt Vastu × Science planner" }, P.pack(st)), null, 1), "application/json"); break;
      case "svg": st.pop = null; renderBar(); download((st.name || "vastu-plan").replace(/[^\w-]+/g, "-") + ".svg", standaloneSvg(), "image/svg+xml"); break;
      case "import": st.pop = null; renderBar(); App.$("#pl-import", root).click(); break;
    }
  }

  // Site edits re-fit an automatic layout; a hand-made one is kept and clamped into the plot.
  function siteChange(fn) {
    change(function () {
      fn();
      const s = st.site;
      ["left", "right"].forEach(function (k) { s.set[k] = Math.min(s.set[k], s.W / 3); });
      ["front", "rear"].forEach(function (k) { s.set[k] = Math.min(s.set[k], s.D / 3); });
      if (!st.touched) arrange();
      else st.items.forEach(function (it) {
        if (it.w) { it.w = Math.min(it.w, s.W); it.h = Math.min(it.h, s.D); it.x = clamp(it.x, 0, s.W - it.w); it.y = clamp(it.y, 0, s.D - it.h); }
        else if (def(it).kind === "door") Object.assign(it, P.snapDoor(s, it, fp()));
        else { it.x = clamp(it.x, 0, s.W); it.y = clamp(it.y, 0, s.D); }
      });
    }, { auto: !st.touched });
  }

  function onInput(e) {
    const el = e.target, a = el.dataset && el.dataset.act;
    if (!a) return;
    const s = st.site, it = find(st.sel);
    if (a === "fine" && e.type === "input") { s.fine = +el.value; renderCanvas(); const o = el.parentNode.querySelector("output"); if (o) o.textContent = ((s.facing + s.fine) % 360 + 360) % 360 + "° (" + DIR_NAMES[DIRS[P.dirIndex(s.facing)]] + (s.fine ? (s.fine > 0 ? " +" : " ") + s.fine + "°" : "") + ")"; return; }
    if (a === "weight" && e.type === "input") { st.weight = +el.value / 100; const o = el.parentNode.querySelector("output"); if (o) o.textContent = st.weight === 0.5 ? "equal" : st.weight > 0.5 ? Math.round(st.weight * 100) + " % Vastu" : Math.round((1 - st.weight) * 100) + " % science"; renderCanvas(); renderBar(); return; }
    if (a === "underlay-op") { st.underlayOpacity = +el.value; renderCanvas(); if (e.type === "change") storeImage(); return; }
    if (a === "pname") { if (e.type === "change") { st.name = el.value.trim().slice(0, 60); save(); } return; }
    if (e.type !== "change") return;
    const v = fromU(parseFloat(el.value));
    const ok = isFinite(v) && v >= 0;
    setTimeout(function () {
      switch (a) {
        case "fine": siteChange(function () { s.fine = +el.value; }); break;
        case "weight": change(function () { st.weight = +el.value / 100; if (!st.touched) arrange(); }, { auto: !st.touched }); break;
        case "pl-W": if (ok && v >= 3) siteChange(function () { s.W = Math.min(v, 300); }); else renderAll(); break;
        case "pl-D": if (ok && v >= 3) siteChange(function () { s.D = Math.min(v, 300); }); else renderAll(); break;
        case "set": if (ok) siteChange(function () { s.set[{ "pl-sf": "front", "pl-sr": "rear", "pl-sl": "left", "pl-sR": "right" }[el.id]] = v; }); else renderAll(); break;
        case "corner": siteChange(function () { s.corner = el.value || null; }); break;
        case "rename": if (it) change(function () { it.n = el.value.trim().slice(0, 40) || undefined; }); break;
        case "iw": if (it && ok && v >= 0.5) change(function () { it.w = round2(Math.min(v, s.W)); it.x = clamp(it.x, 0, s.W - it.w); it.area = it.w * it.h; }); else renderAll(); break;
        case "ih": if (it && ok && v >= 0.5) change(function () { it.h = round2(Math.min(v, s.D)); it.y = clamp(it.y, 0, s.D - it.h); it.area = it.w * it.h; }); else renderAll(); break;
        case "underlay": readImage(el.files[0]); break;
        case "underlay-start": st.traceAfter = true; readImage(el.files[0]); break;
        case "underlay-fit": st.underlayFit = el.value === "building" ? "building" : "plot"; storeImage(); renderCanvas(); break;
        case "import-file": importFile(el.files[0]); break;
      }
    }, 0);
  }

  function readImage(file) {
    if (!file || !/^image\//.test(file.type)) { if (file) App.toast("Please choose an image (JPG or PNG) of your plan.", "warn"); return; }
    const r = new FileReader();
    r.onload = function () {
      // scale big photos down so the image stays light and can be kept on this device
      const img = new Image();
      img.onload = function () {
        const k = Math.min(1, 1800 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas");
        cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        const cx2 = cv.getContext("2d");
        cx2.fillStyle = "#fff"; cx2.fillRect(0, 0, cv.width, cv.height);
        cx2.drawImage(img, 0, 0, cv.width, cv.height);
        st.underlay = cv.toDataURL("image/jpeg", 0.85);
        storeImage();
        if (st.traceAfter) {
          // from the start screen: an empty plot with tracing switched on
          st.traceAfter = false;
          startPlan([]);
          st.trace = true; st.tool = "living"; st.show.zones = false; if (mobile()) st.sheet = "peek";
          renderAll();
          App.toast("Set the plot size and facing in Plot if needed, then drag a box over each room on your drawing.", "ok");
          return;
        }
        renderAll();
        App.toast("Plan image placed under the drawing. Now press “Trace rooms on my plan”.", "ok");
      };
      img.onerror = function () { App.toast("That image could not be read.", "err"); };
      img.src = r.result;
    };
    r.readAsDataURL(file);
    if (App.track) App.track("vastu_plan_overlay");
  }
  function storeImage() {
    try {
      if (st.underlay) localStorage.setItem(STORE + "-img", JSON.stringify({ src: st.underlay, fit: st.underlayFit, op: st.underlayOpacity }));
      else localStorage.removeItem(STORE + "-img");
    } catch (e) { /* too big or storage blocked: the image just is not kept */ }
  }

  function importFile(file) {
    if (!file) return;
    file.text().then(function (txt) {
      const s = P.unpack(JSON.parse(txt));
      change(function () { st.site = s.site; st.items = s.items; st.weight = s.weight; st.sel = null; });
      st.tab = 1; st.start = false; st.sel = null; st.vb = null; renderAll();
      App.toast("Plan opened.", "ok");
    }).catch(function (e) { App.toast(e.message || "Could not read that file.", "err"); });
  }

  async function locate(q) {
    q = (q || "").trim().toLowerCase();
    if (!q) { App.toast("Type a city name first.", "warn"); return; }
    try {
      const stations = await App.loadStations();
      const city = App.INDIA_CITIES.find(function (c) { return c.city.toLowerCase() === q; }) ||
        App.INDIA_CITIES.find(function (c) { return c.city.toLowerCase().indexOf(q) === 0; });
      let target = city ? App.nearestStation(city.lat, city.lon) : null;
      if (!target) {
        const s = stations.find(function (x) { return (x.n + " " + x.st).toLowerCase().indexOf(q) >= 0; });
        if (s) target = { station: s, km: 0 };
      }
      if (!target) { App.toast("No Indian weather station found for “" + q + "”. Try the nearest big town.", "warn"); return; }
      loadStation(target);
    } catch (e) { App.toast("Could not load the station list.", "err"); }
  }
  function near() {
    if (!navigator.geolocation) { App.toast("Location is not available in this browser.", "warn"); return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      App.loadStations().then(function () { const t = App.nearestStation(pos.coords.latitude, pos.coords.longitude); if (t) loadStation(t); });
    }, function () { App.toast("Location permission was refused — type your city instead.", "warn"); }, { timeout: 10000 });
  }
  function loadStation(t) {
    st.locOpen = false;
    App.toast("Using " + t.station.n + (t.km ? " weather station (" + Math.round(t.km) + " km away)" : "") + ".", "ok");
    App.loadUrl(t.station.f[0][1], { stay: true });
  }

  function share() {
    save();
    const link = location.origin + location.pathname + location.search + "#/vastu?plan=" + P.serialize(st);
    if (App.track) App.track("vastu_share");
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () {
      App.toast("Link copied — it opens this exact plan" + (App.state.ds && App.state.ds.meta.sourceUrl ? " with its climate." : "."), "ok");
    }, function () { window.prompt("Copy this link:", link); });
  }

  function download(fname, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = fname; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function standaloneSvg() {
    const m = svgMarkup({ static: true });
    const css = ".pl-road{fill:#d9d4cc}.pl-roadtxt,.pl-zlabel,.pl-dim,.pl-rname,.pl-rdim,.pl-ftxt{text-anchor:middle;dominant-baseline:middle;font-family:sans-serif}.pl-roadtxt{fill:#555;font-weight:700;letter-spacing:.1em}" +
      ".pl-plot{fill:#fff;stroke:#173a2a;stroke-width:.12}.pl-zones polygon{fill-opacity:.28;stroke:#fff;stroke-width:.05}.pl-brahma{stroke:#8d86a0;stroke-width:.05}.pl-zlabel{fill:#173a2a;font-weight:700;opacity:.55}" +
      ".pl-build{fill:none;stroke:#173a2a;stroke-width:.06;stroke-dasharray:.3 .2}.pl-dim{fill:#5e564c}.pl-item.room rect{stroke:#173a2a;stroke-width:.08;fill-opacity:.9}.pl-rname{fill:#173a2a;font-weight:700}.pl-rdim{fill:#3d3a4a}" +
      ".pl-vdot.good{fill:#2f9e44}.pl-vdot.ok{fill:#f59f00}.pl-vdot.bad{fill:#e03131}.pl-doorline{stroke:#173a2a}.pl-swing{fill:none;stroke:#173a2a;stroke-width:.05}.pl-hit{fill:transparent}.pl-ftxt{fill:#173a2a;font-weight:600}" +
      ".pl-heat{fill:#e8590c}.pl-wind line{stroke:#1c7ed6}.pl-wind text{fill:#1c7ed6;text-anchor:middle;font-family:sans-serif}.pl-compass circle{fill:#fff;stroke:#173a2a;stroke-width:.05}.pl-compass path{fill:#e0952c}.pl-compass text{text-anchor:middle;font-weight:700;fill:#173a2a;font-family:sans-serif}";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + m.vb + '" width="1200" height="' + Math.round(1200 * m.vb.split(" ")[3] / m.vb.split(" ")[2]) + '"><style>' + css + "</style>" + m.body + "</svg>";
  }

  /* ---------- report ---------- */
  function renderReport() {
    const c = ctx(), ev = P.evaluate(c, st.items), s = st.site, ds = App.state.ds, b = window.BRAND, numbered = P.numbered(st.items);
    const nm = {};
    numbered.forEach(function (x) { nm[x.uid] = x.n || x.auto || App.VASTU_ROOM[x.t].label; });
    const exact = ((s.facing + (s.fine || 0)) % 360 + 360) % 360;
    let h = '<div class="pl-report-actions no-print"><button type="button" class="btn" data-act="tab" data-tab="1">← Back to the plan</button><button type="button" class="btn" data-act="tab" data-tab="2">Climate strategies</button>' +
      '<button type="button" class="btn primary" data-act="print">Print / save PDF</button><button type="button" class="btn" data-act="share">Copy share link</button>' +
      '<button type="button" class="btn" data-act="json">Download plan file</button><button type="button" class="btn" data-act="import">Open plan file</button>' +
      '<button type="button" class="btn" data-act="svg">Download drawing (SVG)</button></div>';
    h += '<section class="card pl-rep-head"><div><p class="eyebrow">' + App.esc(b.company || "") + "</p><h2>Vastu × Science plan report</h2>" +
      '<p class="small muted">' + new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) + "</p></div>" +
      '<div class="pl-gauges">' + gauge("Vastu", ev.vastu) + gauge("Climate", ev.climate, metrics ? "" : "no city") + gauge("Overall", ev.total) + "</div></section>";
    h += '<div class="pl-rep-grid"><section class="card"><h2>Site</h2><table class="pl-kv"><tbody>' +
      "<tr><th>Plot</th><td>" + len(s.W) + " × " + len(s.D) + " — " + area(s.W * s.D, true) + "</td></tr>" +
      "<tr><th>Facing</th><td>" + DIR_NAMES[DIRS[P.dirIndex(s.facing)]] + " (road side at " + exact + "°)" + (s.corner ? ", corner plot" : "") + "</td></tr>" +
      "<tr><th>Setbacks</th><td>front " + len(s.set.front) + ", rear " + len(s.set.rear) + ", left " + len(s.set.left) + ", right " + len(s.set.right) + "</td></tr>" +
      "<tr><th>Buildable</th><td>" + area(ev.buildArea, true) + "; rooms use " + area(ev.roomArea) + " (" + Math.round(100 * ev.roomArea / ev.buildArea) + " %)</td></tr>" +
      "<tr><th>Climate</th><td>" + (ds ? App.esc(ds.meta.city) + " — " + App.S.NBC_ZONES[ds.nbc.zone].label + " (NBC 2016)" : "Not set — Vastu-only scores") + "</td></tr>" +
      "<tr><th>Balance</th><td>" + (metrics ? Math.round(st.weight * 100) + " % Vastu / " + Math.round((1 - st.weight) * 100) + " % building science" : "Vastu only") + "</td></tr></tbody></table></section>" +
      '<section class="card pl-rep-plan"><h2>Plan</h2>' + (function () { const m = svgMarkup({ static: true }); return '<svg class="pl-svg static" viewBox="' + m.vb + '" role="img" aria-label="Plan drawing">' + m.body + "</svg>"; })() + "</section></div>";
    h += '<section class="card"><h2>Room schedule</h2><div class="table-wrap"><table class="pl-sched"><thead><tr><th>Room</th><th>Size</th><th>Zone</th><th>Vastu</th><th>Climate</th><th>Score</th></tr></thead><tbody>' +
      ev.scored.map(function (r) {
        const d = App.VASTU_ROOM[r.it.t], z = App.zoneById(r.s.zone);
        return "<tr><td><i class=\"sw\" style=\"background:" + d.color + '"></i><b>' + App.esc(nm[r.it.uid]) + "</b></td><td>" + (r.it.w ? len(r.it.w) + " × " + len(r.it.h) + '<div class="small muted">' + area(r.it.w * r.it.h) + "</div>" : "—") + "</td>" +
          '<td><span class="pl-zchip" style="--z:' + z.color + '">' + z.name + '</span></td><td><span class="tag ' + r.s.verdict.toLowerCase() + '">' + r.s.verdict + "</span></td>" +
          '<td class="small">' + (r.s.why ? App.esc(r.s.why) : '<span class="muted">—</span>') + "</td><td><b>" + pct(r.s.total) + "</b></td></tr>";
      }).join("") + "</tbody></table></div></section>";
    h += '<section class="card"><h2>Checks and fixes</h2>' + (ev.issues.length ? '<ul class="pl-issues static">' + ev.issues.map(function (i) {
      return '<li><div class="pl-issue ' + i.sev + '"><b>' + App.esc(i.text) + "</b>" + (i.fix ? "<span>" + App.esc(i.fix) + "</span>" : "") + "</div></li>";
    }).join("") + "</ul>" : '<p class="pl-ok">✓ No overlaps, setback, size or Vastu problems found.</p>') + "</section>";
    if (metrics) {
      const sx = strategies(), m2 = svgMarkup({ static: true, strat: true });
      h += '<section class="card pl-rep-strat"><h2>Climate strategies — ' + App.esc(ds.meta.city) + " (" + sx.zoneLabel + ")</h2>" +
        '<div class="pl-rep-grid"><div><h3>Key moves</h3><ol class="pl-key">' + sx.key.map(function (k) { return "<li>" + App.esc(k) + "</li>"; }).join("") + "</ol>" +
        "<h3>Roof</h3><p class=\"small\">" + App.esc(sx.roof.text) + "</p><h3>Ventilation</h3><ul class=\"tips small\">" + sx.vent.tips.map(function (t) { return "<li>" + App.esc(t) + "</li>"; }).join("") + "</ul></div>" +
        '<div class="pl-rep-plan"><svg class="pl-svg static" viewBox="' + m2.vb + '" role="img" aria-label="Climate strategy plan">' + m2.body + "</svg>" +
        '<p class="pl-legend small"><span><i class="lg-mat high"></i>Hot wall — insulate</span><span><i class="lg-mat mid"></i>Moderate</span><span><i class="lg-mat low"></i>Cool</span><span><i class="lg-chajja"></i>Chajja to scale</span><span><i class="lg-wind">➜</i>Breeze in / out</span><span><i class="lg-tree"></i>Trees</span></p></div></div>' +
        '<div class="table-wrap"><table class="pl-sched"><thead><tr><th>Side</th><th>Shading</th><th>Walls</th><th>Windows</th><th>Planting</th></tr></thead><tbody>' +
        sx.sides.map(function (x) {
          return "<tr><td>" + sideChip(x) + (x.windward ? '<div class="small muted">breeze inlet side</div>' : x.leeward ? '<div class="small muted">breeze outlet side</div>' : "") + '</td><td class="small">' + App.esc(x.shade.text) +
            '</td><td class="small">' + App.esc(x.wall.text) + '</td><td class="small">' + App.esc(x.window) + '</td><td class="small">' + App.esc(x.plant.text) + "</td></tr>";
        }).join("") + '</tbody></table></div><ul class="tips small">' + sx.site.map(function (t) { return "<li>" + App.esc(t) + "</li>"; }).join("") + "</ul></section>";
      h += '<section class="card"><h2>Window schedule</h2><p class="small muted">Sizes rounded to standard joinery; inlets lower and smaller on the breeze side, outlets higher and larger on the leeward side. Add a 300–450 mm ventilator near the ceiling above each door and window.</p>' +
        '<div class="table-wrap"><table class="pl-sched"><thead><tr><th>Room</th><th>Wall</th><th>Type</th><th>Width × height</th><th>Sill</th></tr></thead><tbody>' +
        sx.windows.map(function (w) {
          return "<tr><td>" + App.esc(nm[w.uid] || "") + "</td><td>" + DIR_NAMES[w.dir] + '</td><td><span class="tag win-' + w.role + '">' + ROLE[w.role] + "</span></td><td>" + len(w.width) + " × " + len(w.height) + "</td><td>" + len(w.sill) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        "<p class=\"small\"><b>Cross-ventilation:</b> " + sx.vent.crossCount + " of " + sx.vent.habitable + " living rooms and bedrooms have openings on two walls.</p></section>";
      h += '<section class="card"><h2>Walls and roof</h2><div class="pl-rep-grid"><div><h3>Outside walls</h3><ul class="pl-slist">' + sx.sides.map(function (x) {
        return "<li>" + sideChip(x) + "<span><b>" + x.wall.mm + " mm</b> — " + App.esc(x.wall.build) + ".</span></li>";
      }).join("") + '</ul><p class="small muted">' + App.esc(sx.partition) + '.</p></div><div><h3>Roof — ways to cut heat</h3><ol class="pl-roofopts">' + sx.roofOptions.map(function (r) {
        return "<li><div><b>" + App.esc(r.name) + '</b> <span class="tag cost">' + App.esc(r.cost) + "</span></div><span>" + App.esc(r.spec) + '.</span><small class="muted">' + App.esc(r.effect) + ".</small></li>";
      }).join("") + "</ol></div></div></section>";
      const icon = { done: "✓", part: "◐", todo: "!", tip: "•" };
      h += '<section class="card"><h2>Cool-home checklist</h2><ul class="pl-checks">' + sx.checks.map(function (c) {
        return '<li class="' + c.status + '"><i aria-hidden="true">' + icon[c.status] + "</i><div><b>" + App.esc(c.title) + "</b><span>" + App.esc(c.text) + "</span></div></li>";
      }).join("") + "</ul></section>";
      const sol = App.scienceScores(metrics, "solar"), bestK = sol.score.indexOf(Math.max.apply(null, sol.score));
      h += '<section class="card"><h2>Rooftop solar</h2><p>Face the panels <b>' + DIR_NAMES[DIRS[bestK]] + "</b> (" + App.esc(sol.why[bestK]) + "), tilted at about the site latitude (" + ds.meta.lat.toFixed(0) + "°). Vastu also favours " +
        App.VASTU_SOLAR.pref.map(function (z) { return DIR_NAMES[z]; }).join(", ") + " for heavy rooftop structures. Panel frames can face south whatever the room below.</p></section>";
      h += App.card("Climate by direction — " + App.esc(ds.meta.city), dirTable(metrics), { lead: "What each side of the house experiences in a typical year at this site." });
    }
    h += App.card("Important notes", '<ul class="tips small">' + App.VASTU_NOTES.map(function (n) { return "<li>" + App.esc(n) + "</li>"; }).join("") +
      "<li>Climate scores use this site's weather file: façade sun in overheating hours (IMAC band), morning sun, afternoon heat, the warm-weather and night breeze, and winter sun where heating matters. Room sizes are checked against the indicative NBC 2016 Part 3 minimums.</li>" +
      "<li>This is a concept layout. Have the final plan prepared and checked by a qualified architect and structural engineer.</li></ul>" +
      '<p class="small muted">Prepared with ' + App.esc(b.product || "") + " by " + App.esc(b.company || "") + (b.phone ? " · " + App.esc(b.phone) : "") + (b.email ? " · " + App.esc(b.email) : "") + "</p>");
    App.$("#pl-report", root).innerHTML = h;
  }

  function dirTable(m) {
    const r = m.raw;
    const row = function (label, arr, fmt) { return "<tr><th>" + label + "</th>" + arr.map(function (v) { return "<td>" + fmt(v) + "</td>"; }).join("") + "</tr>"; };
    return '<div class="table-wrap"><table class="num"><thead><tr><th></th>' + Z.map(function (z) { return '<th><span class="dir-chip" style="--z:' + z.color + '">' + z.id + "</span></th>"; }).join("") + "</tr></thead><tbody>" +
      row("Solar heat in hot hours (kWh/m²·yr)", r.hotSun, function (v) { return v.toFixed(0); }) +
      row("…of which afternoon 12–19 h", r.pmHotSun, function (v) { return v.toFixed(0); }) +
      row("Morning direct sun 6–10 h", r.amSun, function (v) { return v.toFixed(0); }) +
      row("Useful sun in cool hours", r.coldSun, function (v) { return v.toFixed(0); }) +
      row("Breeze from this side (warm hours)", r.breeze, function (v) { return (100 * v).toFixed(0) + "%"; }) +
      row("Night breeze (19–06 h)", r.nightBreeze, function (v) { return (100 * v).toFixed(0) + "%"; }) +
      row("Rooftop solar, panel facing this way (kWh/m²·yr)", r.roofSolar, function (v) { return v.toFixed(0); }) +
      "</tbody></table></div><p class=\"muted small\">Heating need share " + (100 * m.heatShare).toFixed(0) + " % (HDD 18 °C = " + m.hdd.toFixed(0) + ", CDD 24 °C = " + m.cdd.toFixed(0) + "). Solar values include direct sun and half the diffuse sky on a vertical wall.</p>";
  }

  /* ---------- wiring ---------- */
  function bind() {
    const svg = App.$("#pl-svg", root), canvas = App.$("#pl-canvas", root);
    svg.addEventListener("pointerdown", onDown);
    svg.addEventListener("pointermove", onMove);
    svg.addEventListener("pointerup", onUp);
    svg.addEventListener("pointercancel", onUp);
    svg.addEventListener("wheel", function (e) {
      e.preventDefault();
      const p = svgPoint(e);
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), p.x, p.y);
    }, { passive: false });
    svg.addEventListener("focusin", function (e) {
      const g = e.target.closest && e.target.closest("[data-uid]");
      if (g && g.dataset.uid !== st.sel && !drag) { st.sel = g.dataset.uid; st.zoneInfo = null; renderPanel(); renderCanvas(); renderFloat(); App.$("#pl-sheet", root).classList.add("insp"); }
    });
    svg.addEventListener("keydown", function (e) {
      const g = e.target.closest && e.target.closest("[data-uid]");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); st.sel = g.dataset.uid; renderAll(); const n = App.$("#pl-panel input, #pl-panel button", root); if (n) n.focus(); }
    });
    root.addEventListener("click", function (e) {
      const el = e.target.closest("[data-act]");
      if (!el) { if (st.pop && !e.target.closest(".st-popwrap")) closePop(); return; }
      if (el.tagName === "INPUT" || el.tagName === "SELECT") return;
      act(el.dataset.act, el);
    });
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput);
    root.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.id === "pl-city") { e.preventDefault(); locate(e.target.value); }
      if (e.key === "Enter" && e.target.id === "pl-pname") { e.preventDefault(); e.target.blur(); }
    });
    // rooms dragged from the panel onto the plan
    root.addEventListener("dragstart", function (e) {
      const li = e.target.closest && e.target.closest("[data-drag]");
      if (li) { e.dataTransfer.setData("text/x-room", li.dataset.drag); e.dataTransfer.effectAllowed = "copy"; }
    });
    // plan images and rooms can be dropped on the drawing (kept from the page-wide weather-file drop)
    canvas.addEventListener("dragover", function (e) {
      const room = Array.from(e.dataTransfer.types || []).indexOf("text/x-room") >= 0;
      e.preventDefault(); e.stopPropagation();
      const d = App.$("#pl-drop", root);
      d.textContent = room ? "Drop to place the room here" : "Drop your plan image";
      d.hidden = false;
    });
    canvas.addEventListener("dragleave", function (e) { if (!canvas.contains(e.relatedTarget)) App.$("#pl-drop", root).hidden = true; });
    canvas.addEventListener("drop", function (e) {
      App.$("#pl-drop", root).hidden = true;
      const t = e.dataTransfer.getData("text/x-room");
      if (t && App.VASTU_ROOM[t]) { e.preventDefault(); e.stopPropagation(); const p = svgPoint(e); placeAt(t, p.x, p.y); return; }
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f && /^image\//.test(f.type)) { e.preventDefault(); e.stopPropagation(); document.body.classList.remove("dragging"); readImage(f); }
    });
    if (!keysBound) {
      document.addEventListener("keydown", onKey);
      window.addEventListener("resize", function () { if (root && root.isConnected && App.currentView() === "vastu") { renderCanvas(); renderFloat(); } });
      keysBound = true;
    }
  }
})(window.App);
