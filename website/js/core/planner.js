/* Vastu × Science plan engine: plot geometry, zone detection, façade exposure,
   scoring, automatic arrangement, checks and (de)serialisation. No DOM access.

   Coordinates are metres on the drawing: x to the right, y downwards, origin at the
   plot's top-left corner. The road (front) is always the bottom edge of the drawing.
   theta = screen bearing of true north (degrees clockwise from "up" on the drawing). */
window.App = window.App || {};
(function (App) {
  "use strict";
  const P = {};
  const FT = 0.3048;
  const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const SIDE_BEARING = { top: 0, right: 90, bottom: 180, left: 270 };
  P.FT = FT;
  P.DIRS = DIRS;

  const MITIGATION = {
    bedroom: "Keep it cool: insulated or 230 mm+ walls on sunny sides, small high windows on W/SW with deep chajjas or jaalis, an insulated or cool roof, and a wardrobe or toilet along the west wall as a buffer.",
    living: "Add a deep verandah or chajja on hot sides, windows facing the breeze, light finishes and ceiling fans.",
    kitchen: "Provide a chimney or exhaust fan, cross-ventilation, and shade any west-facing window.",
    pooja: "Bring in morning light with an east clerestory window or skylight.",
    study: "Use north-facing or high-level windows with external shading to avoid glare.",
    dining: "Shade west windows and add a ceiling fan.",
    entrance: "Give the door a shaded porch; if it cannot face the breeze, add ventilators or windows on the windward side.",
    buffer: "Fine as a service room — keep windows facing the breeze for the main rooms.",
    open: "Keep the courtyard open to the breeze side and plant shade trees on the west and south-west.",
    roofshade: "Shade the west roof with a pergola, solar panels or a cool-roof coating instead.",
  };
  P.MITIGATION = MITIGATION;

  /* ---------- plot ---------- */
  // site = {units:"ft"|"m", W, D (metres), facing (az of the road side, deg), fine (deg), corner:null|"left"|"right",
  //         set:{front, rear, left, right} (metres)}
  P.defaultSite = function () {
    return { units: "ft", W: 40 * FT, D: 60 * FT, facing: 90, fine: 0, corner: null,
      set: { front: 5 * FT, rear: 3 * FT, left: 3 * FT, right: 3 * FT } };
  };

  P.theta = function (site) {
    // the road edge (bottom, screen bearing 180) faces facing + fine  ⇒  theta = 180 - facing - fine
    return (((180 - site.facing - (site.fine || 0)) % 360) + 360) % 360;
  };

  P.buildable = function (site) {
    const s = site.set;
    return { x0: s.left, y0: s.rear, x1: site.W - s.right, y1: site.D - s.front };
  };

  P.azOfBearing = function (site, bearing) {
    return (((bearing - P.theta(site)) % 360) + 360) % 360;
  };
  P.bearingOfAz = function (site, az) {
    return (((az + P.theta(site)) % 360) + 360) % 360;
  };
  P.dirIndex = function (az) { return Math.round((((az % 360) + 360) % 360) / 45) % 8; };
  P.sideDir = function (site, side) { return P.dirIndex(P.azOfBearing(site, SIDE_BEARING[side])); };
  P.roadSides = function (site) { return site.corner ? ["bottom", site.corner] : ["bottom"]; };

  // Vastu zone of a point: Brahmasthan = central ninth of the plot, else the 45° sector seen from the plot centre.
  P.zoneAt = function (site, x, y) {
    const dx = x - site.W / 2, dy = y - site.D / 2;
    if (Math.abs(dx) <= site.W / 6 + 1e-9 && Math.abs(dy) <= site.D / 6 + 1e-9) return "C";
    const bearing = Math.atan2(dx, -dy) * 180 / Math.PI;
    return DIRS[P.dirIndex(P.azOfBearing(site, bearing))];
  };

  P.center = function (it) {
    return it.w ? { x: it.x + it.w / 2, y: it.y + it.h / 2 } : { x: it.x, y: it.y };
  };
  P.zoneOf = function (site, it) { const c = P.center(it); return P.zoneAt(site, c.x, c.y); };

  // Outline of the building: the bounding box of its rooms (so a traced plan that does not
  // reach the setback line still has outside walls), or the buildable area when there are none.
  P.footprint = function (site, items) {
    const rooms = (items || []).filter(function (it) { return it.w && App.VASTU_ROOM[it.t] && App.VASTU_ROOM[it.t].kind === "room"; });
    if (!rooms.length) return P.buildable(site);
    return rooms.reduce(function (a, it) {
      return { x0: Math.min(a.x0, it.x), y0: Math.min(a.y0, it.y), x1: Math.max(a.x1, it.x + it.w), y1: Math.max(a.y1, it.y + it.h) };
    }, { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  };

  // Outside walls of a room: sides lying on the building outline (default: the buildable boundary),
  // with their true direction.
  P.facades = function (site, it, tol, bounds) {
    tol = tol == null ? 0.3 : tol;
    const b = bounds || P.buildable(site), out = [];
    if (!it.w) return out;
    const sides = [["top", Math.abs(it.y - b.y0) <= tol, it.w], ["bottom", Math.abs(it.y + it.h - b.y1) <= tol, it.w],
      ["left", Math.abs(it.x - b.x0) <= tol, it.h], ["right", Math.abs(it.x + it.w - b.x1) <= tol, it.h]];
    sides.forEach(function (s) { if (s[1]) out.push({ side: s[0], k: P.sideDir(site, s[0]), len: s[2] }); });
    return out;
  };

  // Side of the building outline (default: the buildable boundary) a door point sits on.
  P.doorSide = function (site, it, bounds) {
    const b = bounds || P.buildable(site);
    const d = [["top", Math.abs(it.y - b.y0)], ["bottom", Math.abs(it.y - b.y1)], ["left", Math.abs(it.x - b.x0)], ["right", Math.abs(it.x - b.x1)]];
    d.sort(function (a, c) { return a[1] - c[1]; });
    return d[0][0];
  };
  P.snapDoor = function (site, it, bounds) {
    const b = bounds || P.buildable(site), side = P.doorSide(site, it, b);
    const x = Math.min(b.x1 - 0.6, Math.max(b.x0 + 0.6, it.x)), y = Math.min(b.y1 - 0.6, Math.max(b.y0 + 0.6, it.y));
    if (side === "top") return { x: x, y: b.y0 };
    if (side === "bottom") return { x: x, y: b.y1 };
    if (side === "left") return { x: b.x0, y: y };
    return { x: b.x1, y: y };
  };

  /* ---------- scoring ---------- */
  function sciOf(ctx, profile) {
    ctx.sci = ctx.sci || {};
    if (!(profile in ctx.sci)) ctx.sci[profile] = App.scienceScores(ctx.metrics, profile);
    return ctx.sci[profile];
  }
  P.sciOf = sciOf;
  // ctx = {site, metrics (from App.siteMetrics or null), weight (0..1 share given to Vastu)}
  P.scoreItem = function (ctx, it) {
    const def = App.VASTU_ROOM[it.t];
    const zone = P.zoneOf(ctx.site, it);
    const vastu = App.vastuScore(def, zone);
    const res = { zone: zone, vastu: vastu, verdict: App.vastuVerdict(def, zone), climate: null, why: "", facades: [], interior: false };
    const sci = ctx.metrics && def.sci ? sciOf(ctx, def.sci) : null;
    if (def.kind === "room") {
      res.facades = P.facades(ctx.site, it, null, ctx.bounds);
      res.interior = res.facades.length === 0;
      if (sci) {
        if (res.interior) {
          res.climate = def.habitable ? 0.25 : 0.5;
          res.why = def.habitable ? "no outside wall — no windows for light and air" : "inside the house — needs a vent or shaft";
        } else {
          let tot = 0, s = 0, best = res.facades[0];
          res.facades.forEach(function (f) { s += sci.score[f.k] * f.len; tot += f.len; if (f.len > best.len) best = f; });
          res.climate = s / tot;
          res.why = DIRS[best.k] + " wall: " + sci.why[best.k];
        }
      }
    } else if (def.kind === "door") {
      const side = P.doorSide(ctx.site, it, ctx.bounds), k = P.sideDir(ctx.site, side);
      res.facades = [{ side: side, k: k, len: 1 }];
      if (sci) { res.climate = sci.score[k]; res.why = "door faces " + DIRS[k] + ": " + sci.why[k]; }
    } else if (sci && zone !== "C") {
      const k = DIRS.indexOf(zone);
      res.climate = sci.score[k]; res.why = sci.why[k];
    }
    res.total = res.climate == null ? vastu : ctx.weight * vastu + (1 - ctx.weight) * res.climate;
    return res;
  };

  /* ---------- checks ---------- */
  function overlap(a, b) {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }
  P.overlap = overlap;

  P.label = function (it) { return it.n || App.VASTU_ROOM[it.t].label; };

  // Full evaluation of a plan: per-item scores, issues, summary.
  P.evaluate = function (ctx, items) {
    const site = ctx.site, b = P.buildable(site), roads = P.roadSides(site);
    ctx = Object.assign({}, ctx, { bounds: P.footprint(site, items) });
    const scored = items.map(function (it) { return { it: it, s: P.scoreItem(ctx, it) }; });
    const issues = [];
    const add = function (sev, uid, text, fix) { issues.push({ sev: sev, uid: uid, text: text, fix: fix || "" }); };
    scored.forEach(function (r) {
      const it = r.it, def = App.VASTU_ROOM[it.t], s = r.s, name = P.label(it);
      if (def.kind === "room") {
        if (it.x < b.x0 - 0.05 || it.y < b.y0 - 0.05 || it.x + it.w > b.x1 + 0.05 || it.y + it.h > b.y1 + 0.05) {
          add("error", it.uid, name + " extends into the setback.", "Move or resize it inside the dashed building line.");
        }
        if (def.nbc) {
          const area = it.w * it.h, width = Math.min(it.w, it.h);
          if (area < def.nbc[0] - 0.05) add("warn", it.uid, name + " is " + area.toFixed(1) + " m², below the NBC 2016 minimum of " + def.nbc[0] + " m².", "Enlarge it.");
          else if (width < def.nbc[1] - 0.05) add("warn", it.uid, name + " is only " + width.toFixed(2) + " m wide (NBC minimum " + def.nbc[1] + " m).", "Make it wider.");
        }
        if (s.interior && def.habitable) add("warn", it.uid, name + " has no outside wall, so it cannot have windows.", "Move it to the edge of the building or add a courtyard beside it (NBC asks for openings of about 1/10 of the floor area).");
      }
      if (def.kind === "door" && roads.indexOf(P.doorSide(site, it, ctx.bounds)) < 0) {
        add("error", it.uid, "The main entrance is not on a road side.", "Drag it to the road side of the plot.");
      }
      if (s.verdict === "Avoid") {
        add("vastu", it.uid, name + " is in the " + App.zoneById(s.zone).name + " zone, which Vastu advises against.", "Better zones: " + P.goodZones(def).join(", ") + ".");
      }
      if (s.climate != null && s.climate < 0.35 && !s.interior) {
        add("climate", it.uid, name + ": " + s.why + ".", MITIGATION[def.sci] || "");
      }
    });
    const rooms = scored.filter(function (r) { return App.VASTU_ROOM[r.it.t].kind === "room"; });
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const o = overlap(rooms[i].it, rooms[j].it);
        if (o > 0.05) add("error", rooms[i].it.uid, P.label(rooms[i].it) + " overlaps " + P.label(rooms[j].it) + " by " + o.toFixed(1) + " m².", "Drag them apart or resize one.");
      }
    }
    ["entrance", "kitchen", "toilets"].forEach(function (t) {
      if (!items.some(function (it) { return it.t === t; })) add("info", null, "No " + App.VASTU_ROOM[t].label.toLowerCase() + " in the plan yet.", "Add it from the room list.");
    });
    const area = rooms.reduce(function (a, r) { return a + r.it.w * r.it.h; }, 0);
    const bArea = (b.x1 - b.x0) * (b.y1 - b.y0);
    const mean = function (k) {
      const v = scored.map(function (r) { return r.s[k]; }).filter(function (x) { return x != null; });
      return v.length ? v.reduce(function (a, x) { return a + x; }, 0) / v.length : null;
    };
    const order = { error: 0, warn: 1, vastu: 2, climate: 3, info: 4 };
    issues.sort(function (a, c) { return order[a.sev] - order[c.sev]; });
    return { scored: scored, issues: issues, vastu: mean("vastu"), climate: mean("climate"), total: mean("total"),
      roomArea: area, buildArea: bArea, plotArea: site.W * site.D };
  };

  P.goodZones = function (def) {
    return def.pref.concat(def.alt).map(function (z) { return App.zoneById(z).name; });
  };

  /* ---------- automatic arrangement ---------- */
  // n × n cells of the building area (n = 3, or 2 on small plots). i/j are position codes:
  // 0 = first row/column, 1 = middle, 2 = last, so a 2 × 2 grid has no middle cells.
  function cellsOf(site, n) {
    n = n || 3;
    const b = P.buildable(site), cw = (b.x1 - b.x0) / n, ch = (b.y1 - b.y0) / n, out = [], code = n === 2 ? [0, 2] : [0, 1, 2];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      out.push({ i: code[i], j: code[j], x: b.x0 + i * cw, y: b.y0 + j * ch, w: cw, h: ch, used: 0, list: [] });
    }
    return out;
  }
  function gridFor(site, rooms) {
    const b = P.buildable(site), big = rooms.reduce(function (m, r) { return Math.max(m, r.area || App.VASTU_ROOM[r.t].area); }, 0);
    return big > (b.x1 - b.x0) * (b.y1 - b.y0) / 9 * 1.05 ? 2 : 3;
  }

  // Assign every room to one of the cells of the building area by best score, then
  // tile each cell; fixtures go to the best cell corner; the door to the best road-side spot.
  P.autoArrange = function (ctx, items) {
    const site = ctx.site, b = P.buildable(site);
    const rooms = items.filter(function (it) { return App.VASTU_ROOM[it.t].kind === "room"; });
    const cells = cellsOf(site, gridFor(site, rooms));
    const pairs = [];
    rooms.forEach(function (r) {
      const area = r.area || App.VASTU_ROOM[r.t].area;
      cells.forEach(function (c, ci) {
        const probe = { t: r.t, x: c.x, y: c.y, w: c.w, h: c.h };
        // a room that needs windows only goes to the windowless centre cell as a last resort
        const penalty = App.VASTU_ROOM[r.t].habitable && c.i === 1 && c.j === 1 ? 0.3 : 0;
        pairs.push({ r: r, ci: ci, area: area, s: P.scoreItem(ctx, probe).total - penalty });
      });
    });
    pairs.sort(function (a, c) { return c.s - a.s || c.area - a.area; });
    const done = {};
    pairs.forEach(function (p) {
      const c = cells[p.ci];
      if (done[p.r.uid] || c.used + p.area > c.w * c.h * 1.05) return;
      done[p.r.uid] = true; c.used += p.area; c.list.push(p);
    });
    // Rooms that missed out go to the best-scoring cell that still has most of the space they
    // need, else the emptiest one (tile() then shrinks that cell's rooms). Rooms that need
    // windows stay out of the centre cell, which has no outside wall.
    rooms.forEach(function (r) {
      if (done[r.uid]) return;
      const habitable = App.VASTU_ROOM[r.t].habitable;
      const key = function (p) {
        const c = cells[p.ci], free = c.w * c.h - c.used, centre = c.i === 1 && c.j === 1;
        return [habitable && centre ? 0 : 1, free >= p.area * 0.7 ? 1 : 0, free >= p.area * 0.7 ? p.s : free];
      };
      const better = function (a, b) { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
      let best = null, bk = null;
      pairs.forEach(function (p) { if (p.r !== r) return; const k = key(p); if (!best || better(k, bk)) { best = p; bk = k; } });
      const c = cells[best.ci]; c.used += best.area; c.list.push(best);
    });
    const placed = {};
    cells.forEach(function (c) { Object.assign(placed, tile(c)); });
    const out = items.map(function (it) {
      const def = App.VASTU_ROOM[it.t];
      if (def.kind === "room") return Object.assign({}, it, placed[it.uid]);
      return Object.assign({}, it);
    });
    // fixtures: best-scoring cell, inset from the outer corner
    const fixtures = out.filter(function (it) { return App.VASTU_ROOM[it.t].kind === "fixture"; });
    const fixCount = {};
    fixtures.forEach(function (f) {
      let best = null;
      cells.forEach(function (c, ci) {
        const p = { x: c.x + c.w / 2, y: c.y + c.h / 2, t: f.t };
        const s = P.scoreItem(ctx, p).total - (fixCount[ci] || 0) * 0.05;
        if (!best || s > best.s) best = { s: s, ci: ci };
      });
      const c = cells[best.ci], n = fixCount[best.ci] = (fixCount[best.ci] || 0) + 1;
      const ox = c.i === 0 ? 0.9 : c.i === 2 ? c.w - 0.9 : c.w / 2, oy = c.j === 0 ? 0.9 : c.j === 2 ? c.h - 0.9 : c.h / 2;
      f.x = round(c.x + ox + (n - 1) * (c.i === 2 ? -1.4 : 1.4)); f.y = round(c.y + oy);
    });
    // door: best spot along the road side(s)
    out.filter(function (it) { return App.VASTU_ROOM[it.t].kind === "door"; }).forEach(function (d) {
      let best = null;
      P.roadSides(site).forEach(function (side) {
        [1 / 6, 0.5, 5 / 6].forEach(function (fr) {
          const p = side === "bottom" ? { x: b.x0 + fr * (b.x1 - b.x0), y: b.y1 } : side === "top" ? { x: b.x0 + fr * (b.x1 - b.x0), y: b.y0 }
            : side === "left" ? { x: b.x0, y: b.y0 + fr * (b.y1 - b.y0) } : { x: b.x1, y: b.y0 + fr * (b.y1 - b.y0) };
          const s = P.scoreItem(ctx, { t: d.t, x: p.x, y: p.y }).total;
          if (!best || s > best.s + 1e-9) best = { s: s, p: p };
        });
      });
      d.x = round(best.p.x); d.y = round(best.p.y);
    });
    return out;
  };

  function round(v) { return Math.round(v * 20) / 20; }

  // Lay a cell's rooms out as a squarified treemap (near-square rooms, largest first),
  // anchored at the cell's outer walls; spare area is left as a passage on the inner side.
  function tile(c) {
    const out = {}, list = c.list.slice().sort(function (a, d) { return d.area - a.area; });
    if (!list.length) return out;
    const total = list.reduce(function (s, p) { return s + p.area; }, 0), cellArea = c.w * c.h;
    let w = c.w, h = c.h;
    if (total < cellArea) {
      const f = total / cellArea;
      if (c.i === 1 && c.j === 1) { w = c.w * Math.sqrt(f); h = c.h * Math.sqrt(f); }
      else if (c.i === 1) h = c.h * f;          // top/bottom middle: keep the full outer edge
      else if (c.j === 1) w = c.w * f;          // left/right middle
      else if (c.w >= c.h) w = c.w * f; else h = c.h * f;
      // never thinner than a square of the same area (a lone pooja room stays square)
      const sq = Math.sqrt(total);
      if (w < sq && w < c.w) { w = Math.min(c.w, sq); h = Math.min(c.h, total / w); }
      else if (h < sq && h < c.h) { h = Math.min(c.h, sq); w = Math.min(c.w, total / h); }
    }
    const scale = (w * h) / total;
    const rects = squarifyMin(list.map(function (p) { return p.area * scale; }), w, h, 1.5);
    // local (0,0) is the outer corner: mirror towards the right/bottom edges where needed
    const ox = c.i === 2 ? c.x + c.w - w : c.i === 1 && c.j === 1 ? c.x + (c.w - w) / 2 : c.x;
    const oy = c.j === 2 ? c.y + c.h - h : c.i === 1 && c.j === 1 ? c.y + (c.h - h) / 2 : c.y;
    list.forEach(function (p, k) {
      const r = rects[k];
      const lx = c.i === 2 ? w - r.x - r.w : r.x, ly = c.j === 2 ? h - r.y - r.h : r.y;
      const x0 = round(ox + lx), y0 = round(oy + ly), x1 = round(ox + lx + r.w), y1 = round(oy + ly + r.h);
      out[p.r.uid] = { x: x0, y: y0, w: Math.max(0.5, round(x1 - x0)), h: Math.max(0.5, round(y1 - y0)) };
    });
    return out;
  }

  // Squarified treemap (Bruls, Huizing & van Wijk 2000) of areas (sorted, descending) in a w × h box.
  function squarify(areas, w, h) {
    const out = [];
    let x = 0, y = 0, i = 0;
    const worst = function (row, side) {
      const sum = row.reduce(function (a, v) { return a + v; }, 0), mx = Math.max.apply(null, row), mn = Math.min.apply(null, row);
      return Math.max(side * side * mx / (sum * sum), (sum * sum) / (side * side * mn));
    };
    while (i < areas.length) {
      const side = Math.min(w, h), row = [areas[i]];
      let j = i + 1;
      while (j < areas.length && worst(row.concat(areas[j]), side) <= worst(row, side)) row.push(areas[j++]);
      const sum = row.reduce(function (a, v) { return a + v; }, 0), t = sum / side;
      let pos = 0;
      row.forEach(function (a) {
        const len = a / t;
        out.push(w >= h ? { x: x, y: y + pos, w: t, h: len } : { x: x + pos, y: y, w: len, h: t });
        pos += len;
      });
      if (w >= h) { x += t; w -= t; } else { y += t; h -= t; }
      i = j;
    }
    return out;
  }
  P.squarify = squarify;
  P.squarifyMin = function (a, w, h, m) { return squarifyMin(a, w, h, m); };

  // As squarify, but a final row thinner than minT (a small pooja or store beside a big room)
  // is given its own band of depth minT along the far end of the box; any spare length of
  // that band is left as passage.
  function squarifyMin(areas, w, h, minT) {
    const r = squarify(areas, w, h), last = r[r.length - 1];
    if (areas.length < 2 || Math.min(last.w, last.h) >= minT - 1e-9 || Math.max(w, h) < 2 * minT) return r;
    // items of the last row share its thickness
    const tl = Math.min(last.w, last.h);
    let k = areas.length - 1;
    while (k > 0 && Math.abs(Math.min(r[k - 1].w, r[k - 1].h) - tl) < 1e-6 && (r[k - 1].x === last.x || r[k - 1].y === last.y)) k--;
    const small = areas.slice(k), side = Math.min(w, h), long = Math.max(w, h);
    const sum = small.reduce(function (a, v) { return a + v; }, 0), t = Math.max(minT, sum / side);
    const hw = w >= h ? w - t : w, hh = w >= h ? h : h - t, rest = areas.slice(0, k);
    const hs = rest.reduce(function (a, v) { return a + v; }, 0);
    const head = squarify(rest.map(function (a) { return a * hw * hh / hs; }), hw, hh);
    let pos = 0;
    small.forEach(function (a) {
      const len = a / t;
      head.push(w >= h ? { x: long - t, y: pos, w: t, h: len } : { x: pos, y: long - t, w: len, h: t });
      pos += len;
    });
    return head;
  }

  // Top cells for one room (for "move here" suggestions)
  P.bestSpots = function (ctx, it, n) {
    const cells = cellsOf(ctx.site), def = App.VASTU_ROOM[it.t];
    return cells.map(function (c) {
      let probe;
      if (def.kind === "room") {
        const w = Math.min(it.w, c.w), h = Math.min(it.h, c.h);
        const x = c.i === 0 ? c.x : c.i === 2 ? c.x + c.w - w : c.x + (c.w - w) / 2;
        const y = c.j === 0 ? c.y : c.j === 2 ? c.y + c.h - h : c.y + (c.h - h) / 2;
        probe = { t: it.t, x: round(x), y: round(y), w: it.w, h: it.h };
      } else probe = { t: it.t, x: round(c.x + c.w / 2), y: round(c.y + c.h / 2) };
      const s = P.scoreItem(ctx, probe);
      return { pos: probe, s: s };
    }).sort(function (a, c) { return c.s.total - a.s.total; }).slice(0, n || 3);
  };

  /* ---------- items ---------- */
  let seq = 0;
  P.newItem = function (t, area) {
    const def = App.VASTU_ROOM[t];
    const it = { uid: t + "-" + Date.now().toString(36) + "-" + (seq++), t: t, x: 0, y: 0 };
    if (def.kind === "room") {
      const a = area || def.area, w = round(Math.sqrt(a * 1.25));
      it.w = w; it.h = round(a / w); it.area = a;
    }
    return it;
  };
  P.fromPreset = function (id) {
    const pr = App.VASTU_PRESETS.find(function (p) { return p.id === id; });
    return pr.items.map(function (t) { return P.newItem(t); });
  };
  P.numbered = function (items) {
    // "Toilet 1", "Toilet 2" … for repeated types without a custom name
    const count = {}, idx = {};
    items.forEach(function (it) { count[it.t] = (count[it.t] || 0) + 1; });
    return items.map(function (it) {
      if (it.n || count[it.t] < 2) return it;
      idx[it.t] = (idx[it.t] || 0) + 1;
      return Object.assign({}, it, { auto: App.VASTU_ROOM[it.t].short + " " + idx[it.t] });
    });
  };

  /* ---------- serialisation (share links, autosave, JSON files) ---------- */
  const R2 = function (v) { return Math.round(v * 100) / 100; };
  P.pack = function (state) {
    const s = state.site;
    return { v: 2, u: s.units, W: R2(s.W), D: R2(s.D), f: s.facing, fi: s.fine || 0, c: s.corner || 0,
      sb: [R2(s.set.front), R2(s.set.rear), R2(s.set.left), R2(s.set.right)], w: Math.round(state.weight * 100),
      i: state.items.map(function (it) {
        const a = [it.t, R2(it.x), R2(it.y)];
        if (it.w) a.push(R2(it.w), R2(it.h));
        if (it.n) { while (a.length < 5) a.push(0); a.push(it.n); }
        return a;
      }) };
  };
  const num = function (v, lo, hi) {
    v = +v;
    if (!isFinite(v)) throw new Error("This plan file is damaged.");
    return Math.max(lo, Math.min(hi, v));
  };
  P.unpack = function (o) {
    if (!o || o.v !== 2 || !Array.isArray(o.i) || !Array.isArray(o.sb)) throw new Error("This is not a Vastu × Science plan (version 2).");
    const W = num(o.W, 3, 300), D = num(o.D, 3, 300);
    const site = { units: o.u === "m" ? "m" : "ft", W: W, D: D, facing: num(o.f, 0, 359), fine: num(o.fi || 0, -22.5, 22.5),
      corner: o.c === "left" || o.c === "right" ? o.c : null,
      set: { front: num(o.sb[0], 0, D / 3), rear: num(o.sb[1], 0, D / 3), left: num(o.sb[2], 0, W / 3), right: num(o.sb[3], 0, W / 3) } };
    const items = o.i.slice(0, 80).filter(function (a) { return Array.isArray(a) && App.VASTU_ROOM[a[0]]; }).map(function (a) {
      const it = P.newItem(a[0]);
      it.x = num(a[1], 0, W); it.y = num(a[2], 0, D);
      if (it.w != null) { it.w = num(a[3] || it.w, 0.5, W); it.h = num(a[4] || it.h, 0.5, D); it.area = it.w * it.h; }
      if (a[5]) it.n = String(a[5]).slice(0, 40);
      return it;
    });
    return { site: site, items: items, weight: o.w == null ? 0.5 : num(o.w, 0, 100) / 100 };
  };
  P.serialize = function (state) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(P.pack(state))))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  P.deserialize = function (str) {
    let o;
    try { o = JSON.parse(decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/"))))); }
    catch (e) { throw new Error("This plan link is incomplete or damaged."); }
    return P.unpack(o);
  };

  App.Plan = P;
})(window.App);
