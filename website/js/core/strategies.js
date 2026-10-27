/* Climate strategies for a plan: shading for each outside wall from the site's sun angles,
   wall / window / roof materials by NBC 2016 climate zone and exposure, cross and stack
   ventilation from the warm-weather breeze, and planting around the plot. No DOM access.
   Inputs: a parsed weather file (ds), its siting metrics, and a plan (site + items, core/planner.js). */
window.App = window.App || {};
(function (App) {
  "use strict";
  const D2R = Math.PI / 180;
  const DIR_NAMES = { N: "North", NE: "North-East", E: "East", SE: "South-East", S: "South", SW: "South-West", W: "West", NW: "North-West" };
  const SIDES = [["top", 0], ["right", 90], ["bottom", 180], ["left", 270]];
  const WIN_H = 1.2, WIN_W = 1.2; // typical window opening (m) used to size shading

  /* ---------- shading ---------- */
  // Overhang and fin depths that shade a 1.2 × 1.2 m window for 80 % of the overheating sun-hours
  // (DBT above the IMAC upper limit, DNI ≥ 50 W/m²). Same shadow-angle method as the Shading designer.
  function shadeFor(ds, az) {
    ds._shade = ds._shade || {};
    const key = Math.round(az);
    if (ds._shade[key]) return ds._shade[key];
    const d = ds.d, depthO = [], depthF = [];
    let kwh = 0;
    for (let i = 0; i < ds.n; i++) {
      if (d.elevation[i] <= 0 || d.dir_nor_rad[i] < 50 || d.DBT[i] <= d.imac_nv_up[i]) continue;
      const h = ((d.azimuth[i] - az) % 360 + 540) % 360 - 180;
      if (Math.abs(h) >= 90) continue;
      const v = Math.atan(Math.tan(d.elevation[i] * D2R) / Math.cos(h * D2R)) / D2R;
      depthO.push(Math.min(20, WIN_H / Math.tan(Math.max(v, 0.5) * D2R)));
      depthF.push(Math.abs(h) < 0.5 ? 20 : Math.min(20, WIN_W / Math.tan(Math.abs(h) * D2R)));
      kwh += d.dir_nor_rad[i] * Math.cos(d.elevation[i] * D2R) * Math.cos(h * D2R) / 1000;
    }
    const S = App.S;
    const r = { hours: depthO.length, d80: depthO.length ? S.quantile(depthO, 0.8) : 0, f80: depthF.length ? S.quantile(depthF, 0.8) : 0, kwh: kwh };
    ds._shade[key] = r;
    return r;
  }
  const mm = function (m) { return Math.ceil(m * 20) * 50; }; // round up to 50 mm

  function shadeAdvice(sh, zone) {
    const rain = zone === "warm-humid" ? 600 : 300;
    if (sh.hours < 40) return { kind: "none", depth: rain, text: "Little sun in hot hours — a " + rain + " mm chajja for rain and glare is enough.", short: "chajja " + rain };
    const d = Math.max(rain, mm(Math.min(sh.d80, 3)));
    if (d <= 900) return { kind: "chajja", depth: d, text: "A " + d + " mm chajja (sunshade) over each window shades it for most hot sun-hours.", short: "chajja " + d };
    if (d <= 1200) return { kind: "deep", depth: d, text: "Deep chajja of " + d + " mm, or a verandah / sit-out along this side.", short: "chajja " + d };
    const fins = mm(Math.min(sh.f80, 0.9));
    return { kind: "fins", depth: 900, fins: fins, text: "Low morning/evening sun: a 900 mm chajja plus vertical fins of about " + fins + " mm, a jaali screen or adjustable louvres. Keep windows on this side small.", short: "900 + fins / jaali" };
  }

  /* ---------- materials ---------- */
  const WALL = {
    hot: {
      high: ["Insulating wall: 200 mm AAC block (U ≈ 0.8) or 230 mm rat-trap bond brick (cavity), light-coloured finish (SRI > 60).", "AAC 200 / rat-trap"],
      mid: ["230 mm burnt-clay brick or 200 mm AAC block with a light-coloured finish.", "brick 230 / AAC"],
      low: ["Standard 230 mm brick or CSEB; this cooler side can carry more of the windows.", "brick / CSEB"] },
    humid: {
      high: ["Low-mass, quick-drying wall: 200 mm AAC or CSEB with lime plaster and light, water-repellent paint.", "AAC / CSEB"],
      mid: ["150–200 mm AAC or CSEB, breathable lime plaster; avoid heavy stone that stays warm at night.", "AAC / CSEB"],
      low: ["CSEB or brick; use this side for large, openable windows.", "CSEB / brick"] },
    temperate: {
      high: ["200 mm AAC block or 230 mm brick with a light finish.", "AAC / brick"],
      mid: ["230 mm brick or CSEB.", "brick / CSEB"],
      low: ["230 mm brick or CSEB; generous windows for daylight.", "brick / CSEB"] },
    cold: {
      high: ["Sunny side: 230 mm brick or stone as thermal mass behind large south-facing glazing to store winter sun.", "mass + glass"],
      mid: ["Cavity wall: brick + 50 mm XPS/EPS + brick (U ≤ 0.6).", "insulated cavity"],
      low: ["Insulated cavity wall (brick + 50–75 mm XPS + brick), small windows.", "insulated cavity"] },
  };
  // Outer wall thickness (mm) and build-up by climate group and exposure.
  const WALL_BUILD = {
    hot: { high: [300, "300 mm cavity wall: 115 mm brick + 75 mm air gap or EPS + 115 mm brick (U ≈ 0.9), or 200 mm AAC block (U ≈ 0.8)"],
      mid: [230, "230 mm (9″) burnt-clay brick or 200 mm AAC block"], low: [230, "230 mm (9″) brick or CSEB"] },
    humid: { high: [200, "200 mm AAC block (U ≈ 0.8) or 230 mm CSEB — light and quick to dry"], mid: [200, "200 mm AAC block or CSEB"], low: [200, "150–200 mm CSEB or brick"] },
    temperate: { high: [230, "230 mm brick or 200 mm AAC block"], mid: [230, "230 mm brick or CSEB"], low: [230, "230 mm brick or CSEB"] },
    cold: { high: [300, "300 mm: 230 mm brick or stone (thermal mass) + 50 mm XPS outside, plastered"], mid: [300, "300 mm cavity: 115 mm brick + 50 mm XPS + 115 mm brick (U ≤ 0.6)"], low: [300, "300 mm insulated cavity wall (U ≤ 0.6)"] },
  };
  const PARTITION = "Inside partitions: 115 mm (4½″) brick or 100 mm AAC; keep them light so rooms cool down quickly at night" ;

  function zoneGroup(zone) {
    return zone === "warm-humid" ? "humid" : zone === "temperate" ? "temperate" : zone === "cold" ? "cold" : "hot";
  }
  function windowAdvice(heat, zone, wfr) {
    if (zone === "cold") return heat === "high" ? "Large double-glazed windows to collect winter sun." : "Small double-glazed windows.";
    if (zone === "warm-humid") return heat === "high" ? "Openable windows with louvres or jaali, solar-control glass (SHGC ≤ 0.4)." : "Large openable windows for breeze; total openable area at least " + wfr + " % of floor area (ENS 2018).";
    if (heat === "high") return "Keep glass to about 10 % of this wall; solar-control or low-e glass (SHGC ≤ 0.4).";
    if (heat === "mid") return "Windows about 10–15 % of the wall, shaded; clear glass is fine behind the chajja.";
    return "Windows up to 15–25 % of the wall with clear glass for daylight.";
  }
  function roofAdvice(zone) {
    if (zone === "cold") return { text: "Insulate the roof well: 75–100 mm XPS/PUF over the slab (U ≤ 0.6 W/m²K); a darker finish is fine.", short: "insulated roof" };
    const base = "The roof gets the most sun of any surface. Meet ENS 2018 (U ≤ 1.2 W/m²K): 50 mm XPS or PUF over the RCC slab under the screed, or 100 mm brick-bat coba; finish with white cool-roof paint or china-mosaic (SRI ≥ 78). Solar panels or a pergola over the terrace add shade.";
    return { text: zone === "warm-humid" ? base + " Slope it for heavy rain and give generous eaves." : base, short: "cool + insulated roof" };
  }

  // Ways to cut heat from the roof, most cost-effective first.
  function roofOptions(zone) {
    if (zone === "cold") return [
      { name: "Insulation over the slab", spec: "75–100 mm XPS or PUF over the waterproofing, under the screed (U ≤ 0.6 W/m²K)", effect: "Keeps the heat in on winter nights", cost: "₹₹" },
      { name: "Insulated top-floor ceiling", spec: "False ceiling with 75 mm mineral wool, or an insulated attic under a pitched roof", effect: "Warmer top-floor rooms", cost: "₹₹" },
      { name: "Sunspace / glazed terrace", spec: "A south-facing glazed sit-out on the terrace", effect: "Collects winter sun", cost: "₹₹" },
    ];
    const list = [
      { name: "Cool-roof finish", spec: "White elastomeric cool-roof paint or broken white china-mosaic tiles (SRI ≥ 78)", effect: "Roof surface 15–25 °C cooler on a sunny afternoon", cost: "₹" },
      { name: "Insulation over the slab", spec: "40–50 mm XPS or PUF boards over the waterproofing, under the screed or tiles (U ≈ 0.5 W/m²K; ENS 2018 asks ≤ 1.2)", effect: "Cuts heat coming through the roof by about two-thirds", cost: "₹₹" },
      { name: "Shade the whole roof", spec: "Solar panels or a pergola / sheet canopy 0.6–1 m above the terrace, open at the sides", effect: "Stops direct sun on the slab; the solar panels pay for themselves", cost: "₹₹–₹₹₹" },
      { name: "Filler slab", spec: "Clay pots or Mangalore tiles cast into the underside of the RCC slab (to be designed by your structural engineer)", effect: "Trapped air slows heat; 15–25 % less concrete and steel", cost: "saves money" },
      { name: "Brick-bat coba terrace", spec: "100 mm lime and brick-bat weathering course with a tile finish", effect: "Traditional mass with air pockets that delays and reduces heat", cost: "₹" },
      { name: "Roof garden or inverted pots", spec: "Terrace planters, or a layer of inverted earthen pots under the finish (check load and waterproofing)", effect: "Shade and evaporation keep the slab cool", cost: "₹₹" },
      { name: "Let hot air out at the top", spec: "Openable ventilators or a skylight with vents over the stair / centre, roof vents or turbo ventilators", effect: "Hot air under the ceiling escapes instead of radiating down", cost: "₹" },
      { name: "Tank on the hot corner", spec: "Put the overhead water tank over the south-west or west part of the roof (also what Vastu prefers)", effect: "Shades the hottest part of the roof", cost: "free" },
    ];
    if (zone === "warm-humid") list.splice(2, 0, { name: "Pitched roof with ventilated attic", spec: "Tiled or sheet roof over the slab with open gables and wide eaves", effect: "Sheds heavy rain and vents trapped heat", cost: "₹₹" });
    return list;
  }

  /* ---------- planting ---------- */
  function plantAdvice(side, zone) {
    if (side.windward && side.heat === "high" && zone !== "cold") return { kind: "shade", text: "Hot breeze side: tall-trunked shade trees (neem, Indian almond) whose canopy sits above the windows shade the wall without blocking the breeze; only low hedges below them" + (zone === "hot-dry" ? ", and a water body or wet planting here cools the incoming air." : ".") };
    if (side.windward) return { kind: "hedge", text: "Breeze side: keep it open — lawn and hedges below 1 m so the wind reaches the windows" + (zone === "hot-dry" ? "; a water body or wet planting here cools the incoming air." : ".") };
    if (side.heat === "high" && zone !== "cold") return { kind: "shade", text: "Hot side: shade trees 3–6 m from the wall (neem, Indian almond, gulmohar, amaltas) or a pergola with creepers; no dark paving here." };
    if (side.dir === "S" && (zone === "composite" || zone === "hot-dry" || zone === "cold")) return { kind: "deciduous", text: "Deciduous trees (gulmohar, amaltas): shade in summer, sun in winter." };
    if (side.dir === "N" || side.dir === "NE" || side.dir === "E") return { kind: "open", text: "Keep open: lawn, low shrubs, tulsi — it lets in morning light and breeze, and Vastu prefers an open north-east." };
    return { kind: "shrub", text: "Medium shrubs and permeable paving." };
  }

  /* ---------- main ---------- */
  App.planStrategies = function (ds, metrics, site, items) {
    const P = App.Plan, S = App.S, zone = ds.nbc.zone, grp = zoneGroup(zone), raw = metrics.raw;
    const wfr = { "composite": 12.5, "hot-dry": 10, "warm-humid": 16.66, "temperate": 12.5, "cold": 8.33 }[zone];
    // warm-weather breeze
    const bk = raw.breeze.indexOf(Math.max.apply(null, raw.breeze)), bAz = bk * 45;
    const sides = SIDES.map(function (sd) {
      // exposure class: hot-hour sun, or in a cold climate the (welcome) winter sun
      const az = P.azOfBearing(site, sd[1]), k = P.dirIndex(az), n = metrics.norm[zone === "cold" ? "coldSun" : "hotSun"][k];
      const heat = n > 0.66 ? "high" : n > 0.33 ? "mid" : "low";
      const diff = Math.abs(((az - bAz) % 360 + 540) % 360 - 180);
      return { side: sd[0], az: Math.round(az), k: k, dir: P.DIRS[k], dirName: DIR_NAMES[P.DIRS[k]], heat: heat, hotKwh: raw.hotSun[k],
        windward: diff <= 67.5 && raw.breeze[bk] > 0.05, leeward: diff >= 112.5 && raw.breeze[bk] > 0.05 };
    });
    // only the most aligned side counts as windward / leeward
    const align = function (s) { return Math.abs(((s.az - bAz) % 360 + 540) % 360 - 180); };
    const ww = sides.filter(function (s) { return s.windward; }).sort(function (a, b) { return align(a) - align(b); })[0];
    const lw = sides.filter(function (s) { return s.leeward; }).sort(function (a, b) { return align(b) - align(a); })[0];
    sides.forEach(function (s) { s.windward = s === ww; s.leeward = s === lw; });
    sides.forEach(function (s) {
      s.shade = shadeAdvice(shadeFor(ds, s.az), zone);
      const w = WALL[grp][s.heat], wb = WALL_BUILD[grp][s.heat];
      s.wall = { text: w[0], short: w[1], mm: wb[0], build: wb[1] };
      s.window = windowAdvice(s.heat, zone, wfr);
      s.plant = plantAdvice(s, zone);
    });

    // rooms and ventilation
    const rooms = items.filter(function (it) { return App.VASTU_ROOM[it.t].kind === "room"; }), fp = P.footprint(site, items);
    const inlets = [], outlets = [], single = [], cross = [];
    rooms.forEach(function (it) {
      const def = App.VASTU_ROOM[it.t], fac = P.facades(site, it, null, fp).map(function (f) { return f.side; });
      const hasW = ww && fac.indexOf(ww.side) >= 0, hasL = lw && fac.indexOf(lw.side) >= 0;
      if (hasW) inlets.push(it.uid);
      if (hasL) outlets.push(it.uid);
      if (def.habitable) {
        if (fac.length >= 2 || (hasW && hasL)) cross.push(it.uid);
        else if (fac.length === 1 && !hasW) single.push(it.uid);
      }
    });
    let comfy = 0;
    for (let i = 0; i < ds.n; i++) if (ds.d.DBT[i] >= ds.d.imac_nv_low[i] && ds.d.DBT[i] <= ds.d.imac_nv_up[i]) comfy++;
    const hot3 = ds.monthly.slice().sort(function (a, b) { return b.tMax - a.tMax; }).slice(0, 3);
    const swing = S.mean(hot3.map(function (m) { return m.tMax - m.tMin; }));
    const b = P.buildable(site), depth = Math.min(b.x1 - b.x0, b.y1 - b.y0);
    const centreFree = !rooms.some(function (it) { return P.zoneOf(site, it) === "C"; });
    const vent = {
      fromDir: P.DIRS[bk], fromName: DIR_NAMES[P.DIRS[bk]], share: raw.breeze[bk], windward: ww ? ww.side : null, leeward: lw ? lw.side : null,
      inlets: inlets, outlets: outlets, single: single, cross: cross, comfortShare: comfy / ds.n, swing: swing,
      stack: zone !== "cold" && (depth > 9 || zone === "hot-dry" || zone === "composite"),
      night: (zone === "hot-dry" || zone === "composite") && swing >= 11,
      tips: [],
    };
    vent.tips.push("Warm-weather breeze comes mostly from the " + vent.fromName + " (" + Math.round(100 * vent.share) + " % of warm hours). " +
      (ww ? "Put smaller, lower inlet windows on the " + ww.dirName + " wall and larger, higher outlet windows on the " + (lw ? lw.dirName : "opposite") + " wall — outlets bigger than inlets speed up the air inside." : "No side faces it squarely: use windows on two adjacent walls of each room and wing walls to catch it."));
    vent.tips.push("Outdoor air is in the comfortable (IMAC) range " + Math.round(100 * vent.comfortShare) + " % of the year — open windows and ceiling fans cover those hours without AC.");
    if (vent.stack) vent.tips.push("Stack ventilation: keep the Brahmasthan " + (centreFree ? "(already open) " : "") + "as a courtyard, double-height hall or skylight with high openable vents; hot air leaves at the top and pulls fresh air through the rooms. Vastu also asks for an open centre.");
    if (vent.night) vent.tips.push("Days are " + Math.round(swing) + " °C hotter than nights in summer: close up and shade by day, open fully at night (night flushing), and use heavy walls/floors inside to store the coolness.");
    if (zone === "warm-humid") vent.tips.push("Humid climate: continuous cross-ventilation matters more than mass — raise the plinth, use ceiling fans in every room and avoid deep rooms with one window.");
    if (single.length) vent.tips.push(single.length + " room" + (single.length > 1 ? "s have" : " has") + " windows on one wall only: add a high ventilator or jaali into a passage, or a door to a cross-ventilated room.");

    const roof = roofAdvice(zone);

    // windows for every room: openable area from ENS 2018 (or NBC's 1/10 of the floor), shared between the
    // outside walls by exposure and breeze — smaller, lower inlets on the windward wall, larger outlets leeward
    // target window area: ~15 % of the floor for daylight (20 % in humid climates), never below the
    // ENS 2018 openable minimum (wfr) or NBC's 1/10; widths rounded to standard joinery sizes
    const openShare = Math.max(0.1, wfr / 100), target = Math.max(openShare, zone === "warm-humid" ? 0.2 : zone === "cold" ? 0.12 : 0.15);
    // standard sizes: feet for plans drawn in feet (2′–7′ wide, 4′ high), metres otherwise
    const FT = 0.3048, inFt = site.units !== "m";
    const SIZES = inFt ? [2, 3, 4, 5, 6, 7].map(function (v) { return v * FT; }) : [0.6, 0.9, 1.2, 1.5, 1.8, 2.1];
    const H = inFt ? { win: 4 * FT, high: 2 * FT, vent: 1.5 * FT } : { win: 1.2, high: 0.6, vent: 0.45 };
    const SILL = inFt ? { vent: 7 * FT, high: 5 * FT, inlet: 2 * FT, outlet: 3.5 * FT, window: 3 * FT } : { vent: 2.1, high: 1.5, inlet: 0.6, outlet: 1.0, window: 0.9 };
    const windows = [], roomWin = {};
    rooms.forEach(function (it) {
      const def = App.VASTU_ROOM[it.t], A = it.w * it.h, fac = P.facades(site, it, null, fp);
      let need = 0, kind = "window";
      if (def.habitable || it.t === "dining") need = target * A;
      else if (it.t === "staircase") need = Math.max(1, 0.08 * A);
      else if (it.t === "pooja") need = 0.36;
      else if (it.t === "toilets") { need = 0.27; kind = "vent"; }
      else if (it.t === "store") { need = 0.14; kind = "vent"; }
      const info = { need: need, area: 0, cross: false, interior: !fac.length, list: [] };
      roomWin[it.uid] = info;
      if (!need || !fac.length) return;
      const heatW = function (x) { return zone === "cold" ? { high: 1.6, mid: 1, low: 0.6 }[x.heat] : { high: 0.4, mid: 0.75, low: 1 }[x.heat]; };
      let use = fac.map(function (f) {
        const x = sides.find(function (y) { return y.side === f.side; });
        const role = x.windward ? "inlet" : x.leeward ? "outlet" : "window";
        return { f: f, x: x, role: role, w: f.len * heatW(x) * (role === "outlet" ? 1.4 : 1) };
      });
      if (kind === "vent") use = [use.slice().sort(function (a, c) { return (c.role === "outlet") - (a.role === "outlet") || c.w - a.w; })[0]];
      const tot = use.reduce(function (a, u) { return a + u.w; }, 0);
      use.forEach(function (u) {
        const share = need * u.w / tot;
        if (share < 0.12 && use.length > 1) return;
        const hotOnly = u.x.heat === "high" && zone !== "cold" && u.role === "window";
        const h = kind === "vent" ? H.vent : hotOnly ? H.high : H.win;
        const sill = kind === "vent" ? SILL.vent : hotOnly ? SILL.high : SILL[u.role];
        const raw = kind === "vent" ? SIZES[0] : share / h;
        let width = SIZES.reduce(function (a, c) { return Math.abs(c - raw) < Math.abs(a - raw) ? c : a; }, SIZES[0]);
        width = Math.max(0.45, Math.min(width, u.f.len - 0.45));
        const sd = u.f.side, cx = it.x + it.w / 2, cy = it.y + it.h / 2;
        const pos = sd === "top" ? { x: cx, y: it.y } : sd === "bottom" ? { x: cx, y: it.y + it.h } : sd === "left" ? { x: it.x, y: cy } : { x: it.x + it.w, y: cy };
        const role = kind === "vent" ? "vent" : hotOnly ? "high" : u.role;
        const win = { uid: it.uid, side: sd, dir: u.x.dir, x: pos.x, y: pos.y, horiz: sd === "top" || sd === "bottom", width: Math.round(width * 1000) / 1000, height: h, sill: sill, role: role, area: width * h };
        windows.push(win); info.list.push(win); info.area += win.area;
      });
      const roles = info.list.map(function (w) { return w.role; });
      info.cross = (roles.indexOf("inlet") >= 0 && roles.indexOf("outlet") >= 0) || new Set(info.list.map(function (w) { return w.side; })).size >= 2;
    });
    const habit = rooms.filter(function (it) { return App.VASTU_ROOM[it.t].habitable; });
    vent.crossCount = habit.filter(function (it) { return roomWin[it.uid] && roomWin[it.uid].cross; }).length;
    vent.habitable = habit.length;

    // a checklist of ways to keep the house cool: checked against the plan where possible
    const hot = sides.slice().sort(function (a, b2) { return b2.hotKwh - a.hotKwh; })[0];
    const label = function (it) { return it.n || App.VASTU_ROOM[it.t].label; };
    const facing = function (it, side) { return P.facades(site, it, null, fp).some(function (f) { return f.side === side; }); };
    const onHot = rooms.filter(function (it) { return facing(it, hot.side); });
    const buffers = onHot.filter(function (it) { return ["toilets", "staircase", "store"].indexOf(it.t) >= 0; });
    const hotBeds = onHot.filter(function (it) { return App.VASTU_ROOM[it.t].sci === "bedroom"; });
    const kitchens = rooms.filter(function (it) { return it.t === "kitchen"; });
    const nsSides = sides.filter(function (x) { return x.dir === "N" || x.dir === "S"; });
    const fpW = fp.x1 - fp.x0, fpD = fp.y1 - fp.y0;
    const nsLong = nsSides.length ? (nsSides[0].side === "top" || nsSides[0].side === "bottom" ? fpW >= fpD : fpD >= fpW) : null;
    const checks = [];
    const chk = function (status, title, text) { checks.push({ status: status, title: title, text: text }); };
    if (zone !== "cold") {
      chk(buffers.length ? "done" : "todo", "Service rooms as a heat buffer on the hot " + hot.dirName + " side",
        buffers.length ? buffers.map(label).join(", ") + " already shield the " + hot.dirName + " wall." : "Put the stair, toilets or store along the " + hot.dirName + " wall so living rooms and bedrooms stay cooler.");
      chk(hotBeds.length ? "todo" : "done", "Bedrooms away from the hottest wall",
        hotBeds.length ? hotBeds.map(label).join(", ") + " face" + (hotBeds.length > 1 ? "" : "s") + " the hot " + hot.dirName + " wall — move it, or add a wardrobe wall, cavity wall and deep shading there." : "No bedroom faces the hot " + hot.dirName + " wall.");
    }
    if (habit.length) chk(vent.crossCount === habit.length ? "done" : vent.crossCount >= habit.length / 2 ? "part" : "todo", "Cross-ventilation in every living room and bedroom",
      vent.crossCount + " of " + habit.length + " rooms have windows on two walls. " + (vent.crossCount < habit.length ? "For the others, add a ventilator above the door into a passage or a jaali to the next room." : ""));
    if (kitchens.length && lw) chk(kitchens.some(function (it) { return facing(it, lw.side); }) ? "done" : "todo", "Kitchen on the leeward (" + lw.dirName + ") side",
      kitchens.some(function (it) { return facing(it, lw.side); }) ? "Cooking heat and smells leave the house with the breeze." : "Give the kitchen an outside wall on the " + lw.dirName + " side, or fit a chimney and exhaust fan.");
    if (zone !== "cold") chk(centreFree ? "done" : "todo", "Open centre for stack ventilation", centreFree ? "The Brahmasthan is open: make it a courtyard, double-height hall or skylight with high vents." : "A room sits in the centre; a skylight or vents above it still help hot air out.");
    if (nsLong != null && zone !== "cold") chk(nsLong ? "done" : "part", "Longer walls facing north and south", nsLong ? "The long walls face north and south, which are the easiest to shade." : "The long walls face east and west, which get low morning and evening sun — shade them well (fins, jaali, verandah).");
    const tips = [
      ["Light, reflective outside paint", "White or light colours (SRI > 60) on walls and parapets keep them 5–10 °C cooler in the sun."],
      ["Ventilators near the ceiling", "A 300–450 mm ventilator above every door and window lets the hottest air out, even at night with windows closed."],
      ["Ceiling fans in every room", "Air movement of 1 m/s makes about 28–30 °C feel comfortable (IMAC) — far cheaper to run than AC."],
      ["Jaali or louvred shutters", "Ventilate at night while staying secure and keeping out sun and rain."],
      ["Keep heat sources down", "LED lights, a kitchen chimney or exhaust, and the fridge away from bedrooms."],
      ["Green, not paved, around the house", "Grass and shrubs instead of hard paving next to the walls; shade trees on the west and south-west."],
    ];
    if (vent.night) tips.unshift(["Night flushing", "Close and shade windows by day; open them wide from late evening to early morning so the walls and floor cool down."]);
    if (zone === "hot-dry") tips.unshift(["Evaporative cooling", "A desert cooler, a small water body in the courtyard or wet khus mats on the breeze side cool dry air by 6–10 °C."]);
    if (zone === "warm-humid") tips.unshift(["Fight the damp", "Raise the plinth at least 450 mm, keep air moving day and night, and avoid heavy walls that stay warm and damp."]);
    if (zone === "cold") tips.splice(0, tips.length, ["Seal draughts", "Weather-strip doors and windows; use double glazing on the cold sides."], ["Thermal mass in the sun", "A stone or brick floor/wall behind south glazing stores daytime warmth."], ["Entrance lobby", "A buffer porch or airlock at the main door keeps cold air out."]);
    tips.forEach(function (t) { checks.push({ status: "tip", title: t[0], text: t[1] }); });

    const siteTips = [
      "Collect rainwater from the roof into the underground sump or a recharge pit (required in many Indian cities); Vastu prefers it in the north / north-east.",
      "Use permeable paving or grass pavers; keep dark, hard paving away from west and south walls.",
      zone === "hot-dry" ? "Light-coloured compound walls and a shaded, planted courtyard keep dusty hot winds out." : zone === "warm-humid" ? "Raise the plinth at least 450 mm and slope paving away for monsoon drainage." : "Shade parking and sit-outs with pergolas or trees.",
    ];

    // the most important moves, hottest side first
    const hottest = sides.slice().sort(function (a, b2) { return b2.hotKwh - a.hotKwh; })[0];
    const sunny = sides.slice().sort(function (a, b2) { return raw.coldSun[b2.k] - raw.coldSun[a.k]; })[0];
    const key = zone === "cold" ? [
      "Insulate the roof and walls first (" + roof.short + ", insulated cavity walls).",
      "Collect winter sun: large double-glazed windows on the " + sunny.dirName + " side with thermal mass behind them.",
      "Keep windows small on the other sides and seal against cold winds.",
    ] : [
      "Shade the " + hottest.dirName + " side first: " + hottest.shade.text,
      "Roof: " + roof.short + " — the biggest single heat source.",
      ww ? "Cross-ventilate from the " + ww.dirName + " to the " + (lw ? lw.dirName : "opposite") + " side." : "Ventilate every room through two walls.",
      "Walls on the hot " + hottest.dirName + " side: " + hottest.wall.short + ".",
    ];
    if (vent.stack) key.push("Open centre (Brahmasthan) as a courtyard or skylight for stack ventilation.");
    return { zone: zone, zoneLabel: S.NBC_ZONES[zone].label, footprint: fp, sides: sides, roof: roof, roofOptions: roofOptions(zone), vent: vent,
      windows: windows, roomWin: roomWin, partition: PARTITION, checks: checks, openShare: openShare, site: siteTips, key: key };
  };

  App.planStrategies.shadeFor = shadeFor;
  App.planStrategies.DIR_NAMES = DIR_NAMES;
})(window.App);
