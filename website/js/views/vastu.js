/* Vastu × Science planner: a guided four-step workspace (Site → Rooms → Arrange → Report).
   The plan engine lives in core/planner.js; this file is the interactive drawing, panels,
   history, autosave, sharing and the printable report. */
(function (App) {
  "use strict";
  const P = App.Plan, FT = P.FT, DIRS = P.DIRS, Z = App.VASTU_ZONES;
  const STORE = "tc-vastu-plan-v2";
  const STEPS = [["site", "Site"], ["rooms", "Rooms"], ["arrange", "Arrange"], ["climate", "Climate"], ["report", "Report"]];
  const REPORT = 4, CLIMATE = 3;
  const QUICK_SIZES = [[30, 40], [30, 50], [40, 60], [50, 80], [60, 90]];
  const DIR_NAMES = { N: "North", NE: "North-East", E: "East", SE: "South-East", S: "South", SW: "South-West", W: "West", NW: "North-West" };

  const st = {
    loaded: false, step: 0, site: null, items: [], weight: 0.5, sel: null, zoneInfo: null, touched: false,
    show: { zones: true, climate: true, dims: true, shade: true, mat: true, vent: true, trees: true },
    underlay: null, underlayOpacity: 0.5, underlayFit: "plot", trace: false, tool: null,
    hist: [], fut: [], locOpen: false,
  };
  let root = null, metrics = null, drag = null, keysBound = false;

  /* ---------- state ---------- */
  function ctx() { return { site: st.site, metrics: metrics, weight: metrics ? st.weight : 1 }; }
  function snapshot() { return JSON.stringify(P.pack(st)); }
  function restore(json) {
    const s = P.unpack(JSON.parse(json));
    // keep item ids stable where possible so the selection survives undo
    s.items.forEach(function (it, i) { if (st.items[i] && st.items[i].t === it.t) it.uid = st.items[i].uid; });
    st.site = s.site; st.items = s.items; st.weight = s.weight;
    if (!find(st.sel)) st.sel = null;
  }
  function change(fn, opts) {
    st.hist.push(snapshot()); if (st.hist.length > 80) st.hist.shift();
    st.fut = [];
    fn();
    if (!(opts && opts.auto)) st.touched = true;
    save(); renderAll();
  }
  function undo() { if (!st.hist.length) return; st.fut.push(snapshot()); restore(st.hist.pop()); save(); renderAll(); }
  function redo() { if (!st.fut.length) return; st.hist.push(snapshot()); restore(st.fut.pop()); save(); renderAll(); }
  function save() {
    const code = P.serialize(st);
    try { localStorage.setItem(STORE, JSON.stringify({ code: code, touched: st.touched })); } catch (e) { /* storage unavailable */ }
    if (App.currentView() === "vastu") history.replaceState(null, "", location.pathname + location.search + "#/vastu?plan=" + code);
  }
  function load() {
    st.loaded = true;
    try {
      const img = JSON.parse(localStorage.getItem(STORE + "-img") || "null");
      if (img && /^data:image\//.test(img.src)) { st.underlay = img.src; st.underlayFit = img.fit === "building" ? "building" : "plot"; st.underlayOpacity = +img.op || 0.5; }
    } catch (e) { /* ignore */ }
    const m = location.hash.match(/[?&]plan=([A-Za-z0-9_-]+)/);
    if (m) {
      try { Object.assign(st, P.deserialize(m[1])); st.touched = true; st.step = 2; return; }
      catch (e) { App.toast(e.message, "err"); }
    }
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved && saved.code) { Object.assign(st, P.deserialize(saved.code)); st.touched = !!saved.touched; st.step = st.items.length ? 2 : 0; return; }
    } catch (e) { /* ignore a damaged autosave */ }
    st.site = P.defaultSite();
    st.items = P.fromPreset("3bhk");
    arrange();
  }
  function arrange() { st.items = P.autoArrange(ctx(), st.items); st.touched = false; }
  function fp() { return P.footprint(st.site, st.items); }
  function find(uid) { return st.items.find(function (it) { return it.uid === uid; }) || null; }
  function def(it) { return App.VASTU_ROOM[it.t]; }
  function name(it) { return it.n || it.auto || def(it).label; }

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
    html: function () {
      return App.pageHead("Vastu × Science planner", "Draw your plot, pick your rooms and let the planner place them using the Vastu wheel and your site's real sun, heat and wind. Then drag anything to fine-tune — every move is scored live.") +
        '<nav class="pl-steps" id="pl-steps" aria-label="Planner steps"></nav>' +
        '<div class="pl-work" id="pl-work">' +
        '<aside class="pl-panel card" id="pl-panel" aria-live="polite"></aside>' +
        '<section class="pl-stage card" aria-label="Plan drawing">' +
        '<div class="pl-bar" id="pl-bar"></div>' +
        '<div class="pl-canvas" id="pl-canvas"><svg id="pl-svg" class="pl-svg" role="application" aria-label="Plot plan. Select a room, then use arrow keys to move it."></svg>' +
        '<div class="pl-drop" id="pl-drop" hidden>Drop your plan image</div></div>' +
        '<div class="pl-legend" id="pl-legend"></div></section></div>' +
        '<div id="pl-report" class="pl-report" hidden></div>';
    },
    mount: function (r) {
      root = r;
      if (!st.loaded) load();
      const ds = App.state.ds;
      metrics = ds ? App.siteMetrics(ds) : null;
      if (!st.touched) arrange(); // climate may have changed the best layout
      bind();
      renderAll();
    },
  };

  function renderAll() {
    if (!root || !root.isConnected) return;
    renderSteps();
    const report = st.step === REPORT;
    App.$("#pl-work", root).hidden = report;
    App.$("#pl-report", root).hidden = !report;
    if (report) { renderReport(); return; }
    renderPanel(); renderBar(); renderCanvas(); renderLegend();
  }

  function renderSteps() {
    const ev = P.evaluate(ctx(), st.items);
    const counts = [null, st.items.length + " items", ev.issues.filter(function (i) { return i.sev === "error"; }).length ? "needs fixes" : "scored " + pct(ev.total),
      App.state.ds ? App.S.NBC_ZONES[App.state.ds.nbc.zone].label : "pick a city", null];
    App.$("#pl-steps", root).innerHTML = STEPS.map(function (s, i) {
      return '<button type="button" class="pl-step' + (i === st.step ? " on" : "") + (i < st.step ? " done" : "") + '" data-act="step" data-step="' + i + '"' + (i === st.step ? ' aria-current="step"' : "") + ">" +
        '<span class="pl-step-n">' + (i < st.step ? "✓" : i + 1) + '</span><span class="pl-step-t">' + s[1] + (counts[i] ? '<small>' + counts[i] + "</small>" : "") + "</span></button>";
    }).join('<span class="pl-step-line" aria-hidden="true"></span>');
  }

  /* ---------- score bar ---------- */
  function gauge(label, v, sub) {
    const g = grade(v), deg = v == null ? 0 : Math.round(360 * v);
    return '<div class="pl-gauge ' + g + '"><div class="pl-ring" style="--deg:' + deg + 'deg"><span>' + pct(v) + '</span></div><div><b>' + label + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div></div>";
  }
  function renderBar() {
    const ev = P.evaluate(ctx(), st.items);
    const errs = ev.issues.filter(function (i) { return i.sev === "error" || i.sev === "warn"; }).length;
    const tog = function (k, label) { return '<button type="button" class="chip' + (st.show[k] ? " on" : "") + '" data-act="toggle" data-k="' + k + '" aria-pressed="' + st.show[k] + '">' + label + "</button>"; };
    App.$("#pl-bar", root).innerHTML =
      '<div class="pl-gauges">' + gauge("Vastu", ev.vastu) + gauge("Climate", ev.climate, metrics ? "" : "pick a city") + gauge("Overall", ev.total) +
      '<button type="button" class="pl-issues-pill ' + (errs ? "bad" : "good") + '" data-act="issues">' + (errs ? "⚠ " + errs + " to fix" : "✓ No problems") + "</button></div>" +
      '<div class="pl-tools"><button type="button" class="icon-btn" data-act="undo" title="Undo (Ctrl+Z)" aria-label="Undo"' + (st.hist.length ? "" : " disabled") + ">↶</button>" +
      '<button type="button" class="icon-btn" data-act="redo" title="Redo (Ctrl+Y)" aria-label="Redo"' + (st.fut.length ? "" : " disabled") + ">↷</button>" +
      '<button type="button" class="btn sm" data-act="auto" title="Place every room in its best zone">✦ Auto-arrange</button>' +
      (st.step === CLIMATE && metrics ? tog("shade", "Shading") + tog("mat", "Materials") + tog("vent", "Breeze") + tog("trees", "Planting") + tog("zones", "Zones")
        : tog("zones", "Zones") + (metrics ? tog("climate", "Sun & wind") : "") + tog("dims", "Sizes")) + "</div>";
  }

  function renderLegend() {
    let h = '<span><i class="lg-dot good"></i>Vastu preferred</span><span><i class="lg-dot ok"></i>Acceptable / neutral</span><span><i class="lg-dot bad"></i>Vastu avoid</span>';
    if (st.step === CLIMATE && metrics) {
      h = '<span><i class="lg-mat high"></i>Hot wall — insulate</span><span><i class="lg-mat mid"></i>Moderate</span><span><i class="lg-mat low"></i>Cool / standard</span>' +
        '<span><i class="lg-chajja"></i>Chajja to scale</span><span><i class="lg-wind">➜</i>Breeze in / out</span><span><i class="lg-tree"></i>Shade trees</span>';
      App.$("#pl-legend", root).innerHTML = h;
      return;
    }
    if (metrics && st.show.climate) h += '<span><i class="lg-heat"></i>Afternoon heat on that side</span><span><i class="lg-wind">➜</i>Warm-weather breeze</span>';
    h += '<span class="muted">Drag to move · corner handles resize · arrow keys nudge (Shift = faster) · R rotate · Del remove</span>';
    App.$("#pl-legend", root).innerHTML = h;
  }

  /* ---------- panels ---------- */
  function renderPanel() {
    // keep keyboard focus on the same control (by id, else by position) across re-renders
    const el = App.$("#pl-panel", root), active = document.activeElement, inside = active && el.contains(active);
    const focusables = function () { return App.$$("input, select, button, a[href]", el); };
    const fid = inside ? active.id : null, fidx = inside ? focusables().indexOf(active) : -1;
    el.innerHTML = [panelSite, panelRooms, panelArrange, panelClimate][st.step]();
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
    return '<h2 class="pl-h">1 · Your site</h2>' +
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
      nextBtn("Next: choose rooms");
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
    const b = P.buildable(st.site), bArea = (b.x1 - b.x0) * (b.y1 - b.y0);
    const rooms = st.items.filter(function (it) { return def(it).kind === "room"; });
    const used = rooms.reduce(function (a, it) { return a + it.w * it.h; }, 0), share = used / bArea;
    const count = function (t) { return st.items.filter(function (it) { return it.t === t; }).length; };
    const group = function (title, kinds) {
      return "<h3>" + title + '</h3><ul class="pl-roomlist">' + App.VASTU_ROOMS.filter(function (r) { return kinds.indexOf(r.kind) >= 0; }).map(function (r) {
        const n = count(r.id);
        return '<li class="' + (n ? "has" : "") + '"><i class="sw" style="background:' + r.color + '"></i><div class="pl-rl"><b>' + r.label + "</b>" +
          '<span class="small muted">Best: ' + r.pref.map(function (z) { return '<span class="zc" style="--z:' + App.zoneById(z).color + '">' + z + "</span>"; }).join("") +
          (r.area ? " · ~" + area(r.area) : "") + "</span></div>" +
          '<div class="pl-count" role="group" aria-label="' + r.label + ' count"><button type="button" data-act="dec" data-t="' + r.id + '" aria-label="One less ' + r.label + '"' + (n ? "" : " disabled") + ">−</button>" +
          "<output>" + n + '</output><button type="button" data-act="inc" data-t="' + r.id + '" aria-label="Add ' + r.label + '">+</button></div></li>';
      }).join("") + "</ul>";
    };
    return '<h2 class="pl-h">2 · Rooms you need</h2>' + traceIntro() +
      '<section class="pl-sec"><h3>…or start from a house type</h3><div class="pl-presets">' + App.VASTU_PRESETS.map(function (p) {
        return '<button type="button" class="pl-preset" data-act="preset" data-p="' + p.id + '"><b>' + p.label + "</b><small>" + p.items.length + " items</small></button>";
      }).join("") + "</div></section>" +
      '<section class="pl-sec"><div class="pl-meter ' + (share > 0.95 ? "bad" : share > 0.8 ? "ok" : "good") + '"><div class="pl-meter-bar"><span style="width:' + Math.min(100, Math.round(share * 100)) + '%"></span></div>' +
      '<p class="small">Rooms take <b>' + area(used) + "</b> of the <b>" + area(bArea) + "</b> buildable area (" + Math.round(share * 100) + " %)." +
      (share > 0.95 ? " They will not fit — remove rooms, reduce setbacks or plan a second floor." : share > 0.8 ? " Tight: keep about 15–20 % for walls and passages." : " Good — room left for walls and passages.") + "</p></div>" +
      group("Rooms", ["room", "door"]) + group("Tanks", ["fixture"]) + "</section>" +
      '<p class="small muted">Room sizes follow typical Indian homes and the NBC 2016 minimums; adjust each one on the drawing in the next step.</p>' +
      nextBtn(st.touched ? "Next: arrange" : "Arrange automatically");
  }

  function scoreBar(label, v) {
    return '<div class="pl-sbar ' + grade(v) + '"><span>' + label + '</span><div><i style="width:' + (v == null ? 0 : Math.round(100 * v)) + '%"></i></div><b>' + pct(v) + "</b></div>";
  }

  function panelArrange() {
    const c = ctx(), ev = P.evaluate(c, st.items), it = find(st.sel);
    let h = '<h2 class="pl-h">3 · Arrange</h2>';
    if (st.trace) h += tracePanel();
    h += '<section class="pl-sec"><div class="field"><label for="pl-weight">Balance: <output>' + (metrics ? (st.weight === 0.5 ? "equal" : st.weight > 0.5 ? Math.round(st.weight * 100) + " % Vastu" : Math.round((1 - st.weight) * 100) + " % science") : "Vastu only — pick a city to add climate") + "</output></label>" +
      '<input type="range" id="pl-weight" data-act="weight" min="0" max="100" step="5" value="' + Math.round(st.weight * 100) + '"' + (metrics ? "" : " disabled") + '><div class="range-ends"><span>Building science</span><span>Vastu</span></div></div>' +
      '<button type="button" class="btn sm" data-act="auto">✦ Auto-arrange with this balance</button></section>';
    if (it) h += inspector(c, ev, it);
    else {
      h += '<section class="pl-sec pl-tip"><b>Tip:</b> tap a room to see why it scores the way it does and the best places for it. Tap empty ground to see what that zone is for.</section>';
      if (st.zoneInfo) h += zoneCard(st.zoneInfo);
      h += issuesBlock(ev.issues);
    }
    h += nextBtn("Next: report");
    return h;
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
  function panelClimate() {
    let h = '<h2 class="pl-h">4 · Climate strategies</h2>';
    if (!metrics) {
      return h + '<section class="pl-sec"><p>Pick your city to see shading, ventilation, materials and planting worked out from its weather data.</p>' + locBlock() + "</section>" + nextBtn("Next: report");
    }
    const sx = strategies(), it = find(st.sel);
    h += '<section class="pl-sec"><p class="small muted">From the ' + App.esc(App.state.ds.meta.city) + ' weather file · ' + sx.zoneLabel + ' climate (NBC 2016). Drawn on the plan: walls coloured by heat, chajjas to scale, breeze in/out and planting.</p>' +
      '<h3>Key moves</h3><ol class="pl-key">' + sx.key.map(function (k) { return "<li>" + App.esc(k) + "</li>"; }).join("") + "</ol></section>";
    if (it && def(it).kind === "room") {
      const fac = P.facades(st.site, it, null, fp()), d = def(it);
      h += '<section class="pl-sec pl-roomtips"><h3><i class="sw" style="background:' + d.color + '"></i>' + App.esc(name(it)) + "</h3>" +
        (fac.length ? fac.map(function (f) {
          const x = sx.sides.find(function (y) { return y.side === f.side; });
          return '<p class="small">' + sideChip(x) + "<br><b>Window:</b> " + App.esc(x.window) + " <b>Shade:</b> " + App.esc(x.shade.short) + " mm. <b>Wall:</b> " + App.esc(x.wall.short) + "." +
            (x.windward ? " <b>Breeze inlet.</b>" : x.leeward ? " <b>Breeze outlet.</b>" : "") + "</p>";
        }).join("") : '<p class="small">No outside wall: ventilate through a high ventilator, a jaali to the passage, or a skylight.</p>') + "</section>";
    }
    h += '<section class="pl-sec"><h3>Shading — each wall</h3><ul class="pl-slist">' + sx.sides.map(function (x) {
      return "<li>" + sideChip(x) + "<span>" + App.esc(x.shade.text) + "</span></li>";
    }).join("") + "</ul></section>";
    h += '<section class="pl-sec"><h3>Materials</h3><ul class="pl-slist">' + sx.sides.map(function (x) {
      return "<li>" + sideChip(x) + "<span><b>Wall:</b> " + App.esc(x.wall.text) + "<br><b>Windows:</b> " + App.esc(x.window) + "</span></li>";
    }).join("") + '<li><span class="pl-zchip" style="--z:#ced4da">Roof</span><span>' + App.esc(sx.roof.text) + "</span></li></ul></section>";
    h += '<section class="pl-sec"><h3>Ventilation</h3><ul class="tips small">' + sx.vent.tips.map(function (t) { return "<li>" + App.esc(t) + "</li>"; }).join("") + "</ul></section>";
    h += '<section class="pl-sec"><h3>Planting & site</h3><ul class="pl-slist">' + sx.sides.map(function (x) {
      return "<li>" + sideChip(x) + "<span>" + App.esc(x.plant.text) + "</span></li>";
    }).join("") + "</ul><ul class=\"tips small\">" + sx.site.map(function (t) { return "<li>" + App.esc(t) + "</li>"; }).join("") + "</ul></section>";
    return h + nextBtn("Next: report");
  }

  function inspector(c, ev, it) {
    const d = def(it), row = ev.scored.find(function (r) { return r.it.uid === it.uid; }), s = row.s, zone = App.zoneById(s.zone);
    const mine = ev.issues.filter(function (i) { return i.uid === it.uid; });
    let h = '<section class="pl-sec pl-insp"><div class="pl-insp-head"><i class="sw" style="background:' + d.color + '"></i>' +
      '<div class="field grow"><label for="pl-name">' + d.label + '</label><input type="text" id="pl-name" data-act="rename" maxlength="40" value="' + App.esc(it.n || "") + '" placeholder="' + App.esc(name(it)) + '"></div>' +
      '<button type="button" class="icon-btn" data-act="deselect" aria-label="Close">✕</button></div>' +
      '<p class="pl-zone-line"><span class="pl-zchip" style="--z:' + zone.color + '">' + zone.name + (s.zone === "C" ? " · Brahmasthan" : "") + '</span> <span class="tag ' + s.verdict.toLowerCase() + '">' + s.verdict + "</span></p>" +
      scoreBar("Vastu", s.vastu) + scoreBar("Climate", s.climate) + scoreBar("Combined", s.total);
    if (s.why) h += '<p class="small"><b>Climate:</b> ' + App.esc(s.why) + ".</p>";
    if (s.climate != null && s.climate < 0.45 && P.MITIGATION[d.sci]) h += '<p class="small pl-fix"><b>How to make it work:</b> ' + P.MITIGATION[d.sci] + "</p>";
    if (d.kind === "room") {
      h += '<div class="pl-row2">' + numField("pl-iw", "Width", it.w, { act: "iw", min: 0.5 }) + numField("pl-ih", "Depth", it.h, { act: "ih", min: 0.5 }) + "</div>" +
        '<p class="small muted">' + area(it.w * it.h, true) + (d.nbc ? " · NBC minimum " + area(d.nbc[0]) + ", " + len(d.nbc[1]) + " wide" : "") + "</p>";
    }
    h += '<div class="btn-row tight">' + (d.kind === "room" ? '<button type="button" class="btn sm" data-act="rotate">⟳ Rotate</button>' : "") +
      '<button type="button" class="btn sm" data-act="dup">⧉ Duplicate</button><button type="button" class="btn sm ghost danger" data-act="remove">Remove</button></div>';
    mine.forEach(function (i) { h += '<div class="pl-issue ' + i.sev + '"><b>' + App.esc(i.text) + "</b>" + (i.fix ? "<span>" + App.esc(i.fix) + "</span>" : "") + "</div>"; });
    const spots = P.bestSpots(c, it, 3);
    h += '<h3>Best places</h3><ol class="pl-spots">' + spots.map(function (sp, k) {
      const z = App.zoneById(sp.s.zone), here = sp.s.zone === s.zone;
      return '<li><span class="pl-zchip" style="--z:' + z.color + '">' + z.name + '</span><span class="tag ' + sp.s.verdict.toLowerCase() + '">' + sp.s.verdict + "</span><b>" + pct(sp.s.total) + "</b>" +
        (here ? '<span class="small muted">here</span>' : '<button type="button" class="btn sm" data-act="spot" data-k="' + k + '">Move here</button>') + "</li>";
    }).join("") + "</ol>";
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
    const strat = metrics && (opts.strat || (!opts.static && st.step === CLIMATE)) ? strategies() : null;
    const s = st.site, W = s.W, D = s.D, v = view(!!strat), b = P.buildable(s), c = ctx(), ev = P.evaluate(c, st.items);
    const fs = Math.max(0.3, Math.min(W, D) / 26), cx = W / 2, cy = D / 2, R = W + D;
    const idp = opts.static ? "plr-" : "pl-";
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
        const fz = Math.min(fs, it.w / Math.max(4, nm.length * 0.62), it.h / 2.4);
        g += '<g class="pl-item room' + (sel ? " sel" : "") + (bad[it.uid] ? " err" : "") + '" data-uid="' + it.uid + '"' + (opts.static ? "" : ' tabindex="0" role="button" aria-label="' + aria + '"') + ">" +
          '<rect x="' + f(it.x) + '" y="' + f(it.y) + '" width="' + f(it.w) + '" height="' + f(it.h) + '" fill="' + d.color + '"/>' +
          '<text class="pl-rname" x="' + f(it.x + it.w / 2) + '" y="' + f(it.y + it.h / 2 - (st.show.dims ? fz * 0.35 : 0)) + '" font-size="' + f(fz) + '">' + App.esc(nm) + "</text>" +
          (st.show.dims || opts.static ? '<text class="pl-rdim" x="' + f(it.x + it.w / 2) + '" y="' + f(it.y + it.h / 2 + fz * 0.85) + '" font-size="' + f(fz * 0.72) + '">' + len(it.w) + " × " + len(it.h) + "</text>" : "") +
          '<circle class="pl-vdot ' + vcls + '" cx="' + f(it.x + it.w - Math.min(0.35, it.w / 6)) + '" cy="' + f(it.y + Math.min(0.35, it.h / 6)) + '" r="' + f(Math.min(0.2, it.w / 10, it.h / 10)) + '"/>';
        if (sel) ["nw", "ne", "sw", "se"].forEach(function (hk) {
          const hx = hk[1] === "w" ? it.x : it.x + it.w, hy = hk[0] === "n" ? it.y : it.y + it.h, hs = fs * 0.7;
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
          '<text class="pl-ftxt" x="' + f(it.x) + '" y="' + f(it.y + r + fs * 0.6) + '" font-size="' + f(fs * 0.62) + '">' + App.esc(nm) + "</text></g>";
      }
    });
    if (strat) g += strategyLayer(strat, { W: W, D: D, b: b, v: v, fs: fs, f: f, idp: idp, static: opts.static });
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
    // walls: each room's outside walls coloured by exposure
    if (st.show.mat || o.static) rooms.forEach(function (it) {
      P.facades(s, it, null, sx.footprint).forEach(function (fc) {
        const x = bySide[fc.side];
        const seg = fc.side === "top" ? [it.x, it.y, it.x + it.w, it.y] : fc.side === "bottom" ? [it.x, it.y + it.h, it.x + it.w, it.y + it.h]
          : fc.side === "left" ? [it.x, it.y, it.x, it.y + it.h] : [it.x + it.w, it.y, it.x + it.w, it.y + it.h];
        g += '<line class="pl-wall" x1="' + f(seg[0]) + '" y1="' + f(seg[1]) + '" x2="' + f(seg[2]) + '" y2="' + f(seg[3]) + '" stroke="' + HEAT_COLOR[x.heat] + '" stroke-width="' + f(Math.max(0.18, fs * 0.42)) + '"><title>' + x.dirName + " wall: " + App.esc(x.wall.text) + "</title></line>";
      });
    });
    // ventilation: inlets on the windward walls, outlets on the leeward walls, a stack vent at the centre
    if (st.show.vent || o.static) {
      const arrow = function (uid, side, inward) {
        const it = find(uid);
        if (!it) return;
        const n = out[side], mx = side === "left" ? it.x : side === "right" ? it.x + it.w : it.x + it.w / 2, my = side === "top" ? it.y : side === "bottom" ? it.y + it.h : it.y + it.h / 2;
        const Lr = Math.max(1, fs * 2.4), sgn = inward ? -1 : 1;
        const x0 = inward ? mx + n[0] * Lr : mx, y0 = inward ? my + n[1] * Lr : my, x1 = inward ? mx - n[0] * Lr * 0.35 : mx + n[0] * Lr, y1 = inward ? my - n[1] * Lr * 0.35 : my + n[1] * Lr;
        g += '<line class="pl-vent ' + (inward ? "in" : "out") + '" x1="' + f(x0) + '" y1="' + f(y0) + '" x2="' + f(x1) + '" y2="' + f(y1) + '" stroke-width="' + f(fs * 0.22) + '" marker-end="url(#' + o.idp + 'arrow)"><title>' + (inward ? "Inlet window (lower, smaller)" : "Outlet window (higher, larger)") + "</title></line>";
        return sgn;
      };
      if (sx.vent.windward) sx.vent.inlets.forEach(function (u) { arrow(u, sx.vent.windward, true); });
      if (sx.vent.leeward) sx.vent.outlets.forEach(function (u) { arrow(u, sx.vent.leeward, false); });
      if (sx.vent.stack) {
        const r = Math.min(W, D) / 9;
        g += '<g class="pl-stack"><title>Stack vent: courtyard, double-height hall or skylight with high openable vents</title><circle cx="' + f(W / 2) + '" cy="' + f(D / 2) + '" r="' + f(r) + '"/>' +
          '<text x="' + f(W / 2) + '" y="' + f(D / 2) + '" font-size="' + f(fs * 0.62) + '">↑ stack vent</text></g>';
      }
    }
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
    g += '<text class="pl-roofnote" x="' + f(-v.m * 0.9) + '" y="' + f(-v.m * 0.78) + '" font-size="' + f(fs * 0.7) + '">Roof: ' + App.esc(sx.roof.short) + "</text>";
    return g + "</g>";
  }

  function renderCanvas() {
    const svg = App.$("#pl-svg", root), focusUid = document.activeElement && document.activeElement.closest && document.activeElement.closest("#pl-svg [data-uid]");
    const keep = focusUid ? focusUid.dataset.uid : null;
    const m = svgMarkup();
    svg.setAttribute("viewBox", m.vb);
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
          st.items.push(n); st.sel = n.uid;
        });
      }
      return;
    }
    if (!g) {
      const s = st.site;
      st.sel = null;
      st.zoneInfo = p.x >= 0 && p.y >= 0 && p.x <= s.W && p.y <= s.D ? P.zoneAt(s, p.x, p.y) : null;
      renderAll();
      return;
    }
    e.preventDefault();
    const it = find(g.dataset.uid);
    st.sel = it.uid; st.zoneInfo = null;
    drag = { uid: it.uid, mode: h ? h.dataset.h : "move", p0: p, o: Object.assign({}, it), before: snapshot(), moved: false };
    svg.setPointerCapture(e.pointerId);
    if (st.step < 2) st.step = 2;
    renderAll();
  }

  function onMove(e) {
    if (!drag) return;
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

  function onUp() {
    if (!drag) return;
    const dd = drag;
    drag = null;
    if (dd.mode === "draw") {
      const r = dd.rect;
      if (r && r.w >= 0.6 && r.h >= 0.6) {
        change(function () {
          const n = P.newItem(st.tool);
          Object.assign(n, r, { area: r.w * r.h });
          st.items.push(n); st.sel = n.uid;
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
    if (!root || !root.isConnected || App.currentView() !== "vastu" || st.step === REPORT) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redo(); return; }
    if (e.key === "Escape" && st.tool) { st.tool = null; renderAll(); return; }
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
    else if (e.key === "Escape") { st.sel = null; st.tool = null; renderAll(); }
  }

  /* ---------- actions ---------- */
  function placeNew(it) {
    const spot = P.bestSpots(ctx(), it, 1)[0];
    Object.assign(it, spot.pos);
    if (def(it).kind === "door") Object.assign(it, P.snapDoor(st.site, it, fp()));
  }

  function act(a, el) {
    const s = st.site, it = find(st.sel);
    switch (a) {
      case "next": st.step = Math.min(REPORT, st.step + 1); if (st.step === 2 && !st.touched) arrange(); window.scrollTo({ top: root.offsetTop - 70, behavior: "smooth" }); renderAll(); break;
      case "undo": undo(); break;
      case "redo": redo(); break;
      case "auto": change(function () { st.items = P.autoArrange(ctx(), st.items); }, { auto: true }); st.touched = false; save(); App.toast("Rooms placed in their best zones. Drag any of them to adjust.", "ok"); if (App.track) App.track("vastu_auto_arrange"); break;
      case "toggle": st.show[el.dataset.k] = !st.show[el.dataset.k]; renderAll(); break;
      case "issues": st.step = 2; st.sel = null; st.zoneInfo = null; renderAll(); { const p = App.$(".pl-issues", root); if (p) p.scrollIntoView({ block: "nearest", behavior: "smooth" }); } break;
      case "units": s.units = el.dataset.u; save(); renderAll(); break;
      case "size": siteChange(function () { s.W = +el.dataset.w * FT; s.D = +el.dataset.d * FT; s.units = "ft"; }); break;
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
      case "remove": if (it) change(function () { st.items = st.items.filter(function (x) { return x !== it; }); st.sel = null; }); break;
      case "deselect": st.sel = null; renderAll(); break;
      case "spot": if (it) change(function () { const sp = P.bestSpots(ctx(), it, 3)[+el.dataset.k]; Object.assign(it, sp.pos); if (def(it).kind === "door") Object.assign(it, P.snapDoor(s, it, fp())); }); break;
      case "pick": if (el.dataset.uid) { st.sel = el.dataset.uid; renderAll(); const g = App.$('#pl-svg [data-uid="' + el.dataset.uid + '"]', root); if (g) g.focus({ preventScroll: true }); } break;
      case "loc-open": st.locOpen = true; renderPanel(); { const c = App.$("#pl-city", root); if (c) c.focus(); } break;
      case "loc-close": st.locOpen = false; renderPanel(); break;
      case "loc-go": locate(App.$("#pl-city", root).value); break;
      case "loc-near": near(); break;
      case "underlay-clear": st.underlay = null; storeImage(); renderAll(); break;
      case "trace-start":
        if (st.items.length && window.confirm("Start from an empty plot? OK removes the suggested rooms; Cancel keeps them so you can adjust them instead.")) {
          change(function () { st.items = []; st.sel = null; });
        }
        st.trace = true; st.tool = "living"; st.touched = true; st.step = 2; st.show.zones = false;
        if (App.track) App.track("vastu_trace_start");
        renderAll(); break;
      case "tool": st.tool = st.tool === el.dataset.t ? null : el.dataset.t; renderPanel(); renderCanvas(); break;
      case "trace-done": st.trace = false; st.tool = null; st.show.zones = true; renderAll(); App.toast("Plan traced — " + st.items.length + " items. Check the scores, then see the climate strategies.", "ok"); break;
      case "trace-climate": st.trace = false; st.tool = null; st.step = CLIMATE; renderAll(); break;
      case "step": st.step = +el.dataset.step; renderAll(); break;
      case "print": if (App.track) App.track("vastu_print"); window.print(); break;
      case "share": share(); break;
      case "json": download("vastu-plan.json", JSON.stringify(Object.assign({ app: "Tejas Constructions Vastu × Science planner" }, P.pack(st)), null, 1), "application/json"); break;
      case "svg": download("vastu-plan.svg", standaloneSvg(), "image/svg+xml"); break;
      case "import": App.$("#pl-import", root).click(); break;
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
        storeImage(); renderAll();
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
      st.step = 2; renderAll();
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
      ".pl-plot{fill:#fff;stroke:#1f2a44;stroke-width:.12}.pl-zones polygon{fill-opacity:.28;stroke:#fff;stroke-width:.05}.pl-brahma{stroke:#8d86a0;stroke-width:.05}.pl-zlabel{fill:#1f2a44;font-weight:700;opacity:.55}" +
      ".pl-build{fill:none;stroke:#1f2a44;stroke-width:.06;stroke-dasharray:.3 .2}.pl-dim{fill:#5e564c}.pl-item.room rect{stroke:#1f2a44;stroke-width:.08;fill-opacity:.9}.pl-rname{fill:#1f2a44;font-weight:700}.pl-rdim{fill:#3d3a4a}" +
      ".pl-vdot.good{fill:#2f9e44}.pl-vdot.ok{fill:#f59f00}.pl-vdot.bad{fill:#e03131}.pl-doorline{stroke:#1f2a44}.pl-swing{fill:none;stroke:#1f2a44;stroke-width:.05}.pl-hit{fill:transparent}.pl-ftxt{fill:#1f2a44;font-weight:600}" +
      ".pl-heat{fill:#e8590c}.pl-wind line{stroke:#1c7ed6}.pl-wind text{fill:#1c7ed6;text-anchor:middle;font-family:sans-serif}.pl-compass circle{fill:#fff;stroke:#1f2a44;stroke-width:.05}.pl-compass path{fill:#e8801a}.pl-compass text{text-anchor:middle;font-weight:700;fill:#1f2a44;font-family:sans-serif}";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + m.vb + '" width="1200" height="' + Math.round(1200 * m.vb.split(" ")[3] / m.vb.split(" ")[2]) + '"><style>' + css + "</style>" + m.body + "</svg>";
  }

  /* ---------- report ---------- */
  function renderReport() {
    const c = ctx(), ev = P.evaluate(c, st.items), s = st.site, ds = App.state.ds, b = window.BRAND, numbered = P.numbered(st.items);
    const nm = {};
    numbered.forEach(function (x) { nm[x.uid] = x.n || x.auto || App.VASTU_ROOM[x.t].label; });
    const exact = ((s.facing + (s.fine || 0)) % 360 + 360) % 360;
    let h = '<div class="pl-report-actions no-print"><button type="button" class="btn" data-act="step" data-step="2">← Back to drawing</button><button type="button" class="btn" data-act="step" data-step="3">Climate strategies</button>' +
      '<button type="button" class="btn primary" data-act="print">Print / save PDF</button><button type="button" class="btn" data-act="share">Copy share link</button>' +
      '<button type="button" class="btn" data-act="json">Download plan file</button><button type="button" class="btn" data-act="import">Open plan file</button>' +
      '<button type="button" class="btn" data-act="svg">Download drawing (SVG)</button><input type="file" id="pl-import" data-act="import-file" accept=".json,application/json" hidden></div>';
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
    svg.addEventListener("focusin", function (e) {
      const g = e.target.closest && e.target.closest("[data-uid]");
      if (g && g.dataset.uid !== st.sel && !drag) { st.sel = g.dataset.uid; st.zoneInfo = null; if (st.step < 2) st.step = 2; renderPanel(); renderSteps(); renderCanvas(); }
    });
    svg.addEventListener("keydown", function (e) {
      const g = e.target.closest && e.target.closest("[data-uid]");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); st.sel = g.dataset.uid; renderAll(); const n = App.$("#pl-panel input, #pl-panel button", root); if (n) n.focus(); }
    });
    root.addEventListener("click", function (e) {
      const el = e.target.closest("[data-act]");
      if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
      act(el.dataset.act, el);
    });
    root.addEventListener("input", onInput);
    root.addEventListener("change", onInput);
    root.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.id === "pl-city") { e.preventDefault(); locate(e.target.value); }
    });
    // plan image: drop on the drawing (kept from the page-wide weather-file drop)
    canvas.addEventListener("dragover", function (e) { e.preventDefault(); e.stopPropagation(); App.$("#pl-drop", root).hidden = false; });
    canvas.addEventListener("dragleave", function () { App.$("#pl-drop", root).hidden = true; });
    canvas.addEventListener("drop", function (e) {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      App.$("#pl-drop", root).hidden = true;
      if (f && /^image\//.test(f.type)) { e.preventDefault(); e.stopPropagation(); document.body.classList.remove("dragging"); readImage(f); }
    });
    if (!keysBound) { document.addEventListener("keydown", onKey); keysBound = true; }
  }
})(window.App);
