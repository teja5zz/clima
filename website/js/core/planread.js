/* Reading a plan drawing: find the rooms in a photo or scan of a floor plan and read their
   names. Pure functions on an 8-bit grey image, so they run in the browser and in tests.
   Walls, lines and text are the dark pixels; a room is a closed light area inside the
   building. Small gaps (door swings, broken lines) are sealed by thickening the dark
   pixels a little before the light areas are counted. */
(function (App) {
  "use strict";
  const R = {};

  // Otsu's threshold of an 8-bit grey image.
  R.otsu = function (g) {
    const hist = new Float64Array(256);
    for (let i = 0; i < g.length; i++) hist[g[i]]++;
    const n = g.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, t = 128;
    for (let i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = n - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF, v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; t = i; }
    }
    return t;
  };

  // Square dilation of a 0/1 mask by radius r, separable, with running sums.
  function dilate(m, w, h, r) {
    if (r <= 0) return m.slice();
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let s = 0;
      const o = y * w;
      for (let x = 0; x < Math.min(r, w); x++) s += m[o + x];
      for (let x = 0; x < w; x++) {
        if (x + r < w) s += m[o + x + r];
        if (x - r - 1 >= 0) s -= m[o + x - r - 1];
        tmp[o + x] = s > 0 ? 1 : 0;
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = 0; y < Math.min(r, h); y++) s += tmp[y * w + x];
      for (let y = 0; y < h; y++) {
        if (y + r < h) s += tmp[(y + r) * w + x];
        if (y - r - 1 >= 0) s -= tmp[(y - r - 1) * w + x];
        out[y * w + x] = s > 0 ? 1 : 0;
      }
    }
    return out;
  }
  R.dilate = dilate;

  // Fill the 4-connected area of `lab` cells equal to 0 from `start` with `id`; returns the area and box.
  function fill(lab, w, h, start, id, stack) {
    let top = 0, area = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
    stack[top++] = start; lab[start] = id;
    while (top) {
      const i = stack[--top], x = i % w, y = (i - x) / w;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && lab[i - 1] === 0) { lab[i - 1] = id; stack[top++] = i - 1; }
      if (x < w - 1 && lab[i + 1] === 0) { lab[i + 1] = id; stack[top++] = i + 1; }
      if (y > 0 && lab[i - w] === 0) { lab[i - w] = id; stack[top++] = i - w; }
      if (y < h - 1 && lab[i + w] === 0) { lab[i + w] = id; stack[top++] = i + w; }
    }
    return { area: area, x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1 };
  }

  /* Largest axis-aligned rectangle inside room r. Holes left by text and furniture inside the
     room count as room; anything that can be reached from the edge of its box does not. */
  function innerRect(lab, w, r) {
    const bw = r.x1 - r.x0, bh = r.y1 - r.y0, m = new Uint8Array(bw * bh), stack = new Int32Array(bw * bh);
    let top = 0;
    const out = function (i) { if (!m[i]) { m[i] = 2; stack[top++] = i; } };
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (lab[(r.y0 + y) * w + r.x0 + x] === r.id) m[y * bw + x] = 1;
    for (let x = 0; x < bw; x++) { out(x); out((bh - 1) * bw + x); }
    for (let y = 0; y < bh; y++) { out(y * bw); out(y * bw + bw - 1); }
    while (top) {
      const i = stack[--top], x = i % bw;
      if (x > 0) out(i - 1);
      if (x < bw - 1) out(i + 1);
      if (i >= bw) out(i - bw);
      if (i + bw < bw * bh) out(i + bw);
    }
    // largest rectangle of cells that are not outside, row by row with a stack of heights
    const hgt = new Int32Array(bw), st = new Int32Array(bw + 1);
    let best = { a: 0 };
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) hgt[x] = m[y * bw + x] === 2 ? 0 : hgt[x] + 1;
      let sp = 0;
      for (let x = 0; x <= bw; x++) {
        const hx = x < bw ? hgt[x] : 0;
        while (sp && hgt[st[sp - 1]] >= hx) {
          const hh = hgt[st[--sp]], left = sp ? st[sp - 1] + 1 : 0, a = hh * (x - left);
          if (a > best.a) best = { a: a, x0: left, x1: x, y0: y - hh + 1, y1: y + 1 };
        }
        st[sp++] = x;
      }
    }
    return best.a ? { x0: r.x0 + best.x0, x1: r.x0 + best.x1, y0: r.y0 + best.y0, y1: r.y0 + best.y1 } : {};
  }

  /* Find the rooms. g: grey pixels (0 black … 255 white), w × h.
     Returns { rooms: [{id, x0, y0, x1, y1, area, fill}], building: {x0, y0, x1, y1}, labels, close }.
     Room boxes are in pixels; labels holds the room id of every pixel (0 or less elsewhere). */
  R.detect = function (g, w, h, opts) {
    opts = opts || {};
    const n = w * h, t = Math.min(opts.threshold || R.otsu(g), 200);
    const dark = new Uint8Array(n);
    // A pixel is dark below the global threshold, or when it is clearly darker than its
    // surroundings: faint thin lines (door swings in a photo) still close their rooms.
    // The image is smoothed a little first so camera noise is not read as lines.
    const sm = new Float32Array(n), sat = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += g[yy * w + xx]; c++; }
        }
        sm[y * w + x] = s / c;
      }
    }
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) { row += sm[y * w + x]; sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row; }
    }
    const rw = Math.max(8, Math.round(Math.min(w, h) * 0.02)), lc = opts.local == null ? 18 : opts.local;
    for (let y = 0; y < h; y++) {
      const ya = Math.max(0, y - rw), yb = Math.min(h, y + rw + 1);
      for (let x = 0; x < w; x++) {
        const xa = Math.max(0, x - rw), xb = Math.min(w, x + rw + 1);
        const mean = (sat[yb * (w + 1) + xb] - sat[ya * (w + 1) + xb] - sat[yb * (w + 1) + xa] + sat[ya * (w + 1) + xa]) / ((yb - ya) * (xb - xa));
        const v = sm[y * w + x];
        dark[y * w + x] = g[y * w + x] <= t || (lc > 0 && v < mean - lc) ? 1 : 0;
      }
    }
    const rc = opts.close != null ? opts.close : Math.max(1, Math.round(Math.min(w, h) * 0.006));
    const wall = dilate(dark, w, h, rc);
    const lab = new Int32Array(n), stack = new Int32Array(n);
    for (let i = 0; i < n; i++) if (wall[i]) lab[i] = -1;
    // everything light that reaches the edge of the image is outside the building
    for (let x = 0; x < w; x++) {
      if (lab[x] === 0) fill(lab, w, h, x, -2, stack);
      if (lab[(h - 1) * w + x] === 0) fill(lab, w, h, (h - 1) * w + x, -2, stack);
    }
    for (let y = 0; y < h; y++) {
      if (lab[y * w] === 0) fill(lab, w, h, y * w, -2, stack);
      if (lab[y * w + w - 1] === 0) fill(lab, w, h, y * w + w - 1, -2, stack);
    }
    let id = 0;
    const found = [];
    for (let i = 0; i < n; i++) {
      if (lab[i] !== 0) continue;
      const r = fill(lab, w, h, i, ++id, stack);
      r.id = id;
      if (r.area >= Math.max(40, n * 0.0005)) found.push(r);
    }
    if (!found.length) return { rooms: [], building: null, labels: lab, close: rc, w: w, h: h };
    // the building is the box around the candidate areas; rooms are judged against it
    const box = function (list) {
      return list.reduce(function (b, r) {
        return { x0: Math.min(b.x0, r.x0), y0: Math.min(b.y0, r.y0), x1: Math.max(b.x1, r.x1), y1: Math.max(b.y1, r.y1) };
      }, { x0: w, y0: h, x1: 0, y1: 0 });
    };
    const b0 = box(found), bArea = (b0.x1 - b0.x0) * (b0.y1 - b0.y0);
    const kept = found.filter(function (r) {
      const bw = r.x1 - r.x0, bh = r.y1 - r.y0;
      r.fill = r.area / (bw * bh);
      return r.area >= 0.008 * bArea && Math.min(bw, bh) >= 3 * rc && r.fill >= 0.35 && Math.max(bw, bh) / Math.min(bw, bh) <= 8;
    });
    // give back the wall thickening so boxes reach the wall faces
    const grow = function (r) { return { x0: Math.max(0, r.x0 - rc), y0: Math.max(0, r.y0 - rc), x1: Math.min(w, r.x1 + rc), y1: Math.min(h, r.y1 + rc) }; };
    const building = kept.length ? grow(box(kept)) : null;
    // When two boxes overlap by much of the smaller one, the larger room wraps round the other
    // (an L-shaped hall round a kitchen) and keeps the largest rectangle that fits inside it.
    // Small overlaps from door swings are left alone.
    const boxes = kept.map(function (r) { return { r: r, x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, cut: false }; });
    for (let pass = 0, again = true; again && pass < 4; pass++) {
      again = false;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const p = boxes[i], q = boxes[j];
          const ox = Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0), oy = Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0);
          const small = Math.min((p.x1 - p.x0) * (p.y1 - p.y0), (q.x1 - q.x0) * (q.y1 - q.y0));
          if (ox <= rc || oy <= rc || ox * oy < 0.4 * small) continue;
          const cut = (p.x1 - p.x0) * (p.y1 - p.y0) >= (q.x1 - q.x0) * (q.y1 - q.y0) ? p : q;   // the room that wraps round the other
          if (cut.cut) continue;
          Object.assign(cut, innerRect(lab, w, cut.r), { cut: true });
          again = true;
        }
      }
    }
    // What still overlaps is a door-swing pocket joined to a room through its doorway, so it
    // pokes past a wall into the next room. The wall is the darker edge of the overlap strip,
    // and the room whose middle lies beyond that wall gives the strip up.
    const darkness = function (rows, at, from, to) {
      let n = 0, d = 0;
      for (let t = from; t < to; t++) {
        const i = rows ? at * w + t : t * w + at;
        if (at < 0 || at >= (rows ? h : w)) return 0;
        n++; if (lab[i] === -1) d++;
      }
      return n ? d / n : 0;
    };
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i], q = boxes[j];
        const o = { x0: Math.max(p.x0, q.x0), y0: Math.max(p.y0, q.y0), x1: Math.min(p.x1, q.x1), y1: Math.min(p.y1, q.y1) };
        if (o.x1 - o.x0 <= 0 || o.y1 - o.y0 <= 0) continue;
        const rows = o.y1 - o.y0 <= o.x1 - o.x0;   // a flat strip has walls above or below it
        // measured across both boxes: a wall runs on past a doorway, a door swing does not
        const ua = rows ? Math.min(p.x0, q.x0) : Math.min(p.y0, q.y0), ub = rows ? Math.max(p.x1, q.x1) : Math.max(p.y1, q.y1);
        const lo = darkness(rows, (rows ? o.y0 : o.x0) - rc - 1, ua, ub), hi = darkness(rows, (rows ? o.y1 : o.x1) + rc, ua, ub);
        const mid = function (bx) { return rows ? bx.y0 + bx.y1 : bx.x0 + bx.x1; };
        // wall past the far end of the strip: the room lying beyond it loses, and the other way round
        const lose = hi >= lo ? (mid(p) > mid(q) ? p : q) : (mid(p) < mid(q) ? p : q), win = lose === p ? q : p;
        // (2 rc clear, so the boxes still only touch once both are grown back to the wall faces)
        if (rows) {
          if (mid(lose) > mid(win)) lose.y0 = win.y1 + 2 * rc; else lose.y1 = win.y0 - 2 * rc;
        } else if (mid(lose) > mid(win)) lose.x0 = win.x1 + 2 * rc; else lose.x1 = win.x0 - 2 * rc;
      }
    }
    const rooms = boxes.filter(function (bx) { return bx.x1 - bx.x0 > 2 * rc && bx.y1 - bx.y0 > 2 * rc; })
      .map(function (bx) { return Object.assign({ id: bx.r.id, area: bx.r.area, fill: bx.r.fill }, grow(bx)); });
    rooms.sort(function (a, c) { return (a.y0 - c.y0) || (a.x0 - c.x0); });
    return { rooms: rooms, building: building, labels: lab, close: rc, w: w, h: h };
  };

  /* ---------- room names ---------- */
  // Checked in order; short keywords must match a whole word.
  R.KEYWORDS = [
    ["master", ["MASTER", "MBED", "MBR", "MBEDROOM"]],
    ["guest", ["GUEST"]],
    ["children", ["KIDS", "CHILD", "CHILDREN", "CHILDRENS"]],
    ["pooja", ["POOJA", "PUJA", "PRAYER", "MANDIR", "DEVARA"]],
    ["kitchen", ["KITCHEN", "KIT", "KITCH"]],
    ["dining", ["DINING", "DINE"]],
    ["living", ["LIVING", "HALL", "DRAWING", "LOUNGE", "FAMILY"]],
    ["toilets", ["TOILET", "TOILETS", "BATH", "BATHROOM", "WC", "TOI", "WASH"]],
    ["staircase", ["STAIR", "STAIRS", "STAIRCASE"]],
    ["store", ["STORE", "STORAGE", "UTILITY"]],
    ["study", ["STUDY", "OFFICE", "LIBRARY"]],
    ["open", ["COURT", "COURTYARD", "OTS", "SITOUT", "VERANDAH", "VERANDA", "BALCONY", "PORTICO", "PARKING", "CAR", "LAWN", "GARDEN"]],
    ["children", ["BED", "BEDROOM", "BEDRM", "BR"]],
    ["skip", ["PASSAGE", "CORRIDOR", "LOBBY", "FOYER"]],
  ];
  R.typeOf = function (text) {
    const words = String(text || "").toUpperCase().replace(/[^A-Z]+/g, " ").trim().split(" ").filter(Boolean);
    if (!words.length) return null;
    const joined = words.join("");
    for (let k = 0; k < R.KEYWORDS.length; k++) {
      const keys = R.KEYWORDS[k][1];
      for (let j = 0; j < keys.length; j++) {
        const key = keys[j];
        if (words.indexOf(key) >= 0 || joined === key || (key.length >= 5 && joined.indexOf(key) >= 0)) return R.KEYWORDS[k][0];
      }
    }
    return null;
  };

  // Hand each recognised word to the room it sits in. words: [{text, x0, y0, x1, y1}] in pixels.
  R.assignWords = function (det, words) {
    const by = {};
    det.rooms.forEach(function (r) { by[r.id] = []; });
    words.forEach(function (wd) {
      const cx = (wd.x0 + wd.x1) / 2, cy = (wd.y0 + wd.y1) / 2;
      // the text itself is dark, so look at the light pixels around it
      const votes = {};
      const pad = det.close + 2;
      for (let gy = 0; gy <= 4; gy++) {
        for (let gx = 0; gx <= 4; gx++) {
          const x = Math.round(wd.x0 - pad + (wd.x1 - wd.x0 + 2 * pad) * gx / 4), y = Math.round(wd.y0 - pad + (wd.y1 - wd.y0 + 2 * pad) * gy / 4);
          if (x < 0 || y < 0 || x >= det.w || y >= det.h) continue;
          const l = det.labels[y * det.w + x];
          if (by[l]) votes[l] = (votes[l] || 0) + 1;
        }
      }
      let best = null, bv = 0;
      Object.keys(votes).forEach(function (k) { if (votes[k] > bv) { bv = votes[k]; best = k; } });
      if (best == null) {
        const hit = det.rooms.filter(function (r) { return cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1; })
          .sort(function (a, c) { return (a.x1 - a.x0) * (a.y1 - a.y0) - (c.x1 - c.x0) * (c.y1 - c.y0); })[0];
        if (hit) best = hit.id;
      }
      if (best != null) by[best].push(wd);
    });
    det.rooms.forEach(function (r) {
      r.text = by[r.id].sort(function (a, c) { return (a.y0 - c.y0) || (a.x0 - c.x0); }).map(function (x) { return x.text; }).join(" ");
      r.type = R.typeOf(r.text);
    });
    return det;
  };

  /* Room sizes written on the drawing: 14'0" x 13'6", 14' x 13', 4.20 x 3.90 (metres).
     Returns the two lengths in metres, or null. */
  R.sizeOf = function (text) {
    const t = String(text || "");
    const ft = [], re = /(\d{1,2})\s*['’′`]\s*-?\s*(\d{1,2}(?:\.\d)?)?/g;
    let m;
    while ((m = re.exec(t))) ft.push(+m[1] + (m[2] ? +m[2] / 12 : 0));
    if (ft.length >= 2) return [ft[0] * 0.3048, ft[1] * 0.3048];
    const mm = t.match(/(\d{1,2}\.\d{1,2})\s*[xX×*]\s*(\d{1,2}\.\d{1,2})/);
    return mm ? [+mm[1], +mm[2]] : null;
  };

  // Metres per pixel from the rooms whose size is written inside them, or null when no two
  // readings agree (one reading is trusted only when it fits its room both ways round).
  R.scale = function (det) {
    const est = [];
    det.rooms.forEach(function (r) {
      const sz = R.sizeOf(r.text);
      if (!sz) return;
      const w = r.x1 - r.x0, h = r.y1 - r.y0;
      const pairs = [[sz[0] / w, sz[1] / h], [sz[1] / w, sz[0] / h]].map(function (p) { return { s: (p[0] + p[1]) / 2, d: Math.abs(p[0] - p[1]) / (p[0] + p[1]) * 2 }; });
      const best = pairs[0].d <= pairs[1].d ? pairs[0] : pairs[1];
      if (best.d < 0.15) est.push(best.s);
    });
    if (!est.length) return null;
    est.sort(function (a, c) { return a - c; });
    const med = est[est.length >> 1], ok = est.filter(function (s) { return Math.abs(s - med) / med < 0.12; });
    return ok.length >= Math.max(1, Math.ceil(est.length / 2)) ? ok.reduce(function (a, s) { return a + s; }, 0) / ok.length : null;
  };

  /* Where the building goes on the plot. With a scale from the drawing it keeps its true size,
     centred across the plot and set back from the road by the front setback; without one, or
     when it would not fit, it fills the area inside the setbacks. */
  R.placement = function (det, mpp, site, buildable) {
    if (mpp) {
      const bw = (det.building.x1 - det.building.x0) * mpp, bd = (det.building.y1 - det.building.y0) * mpp;
      if (bw <= site.W + 0.01 && bd <= site.D + 0.01) {
        const x0 = Math.min(Math.max(0, (site.W - bw) / 2), site.W - bw);
        const y0 = Math.max(0, site.D - site.set.front - bd);
        return { x0: x0, y0: y0, x1: x0 + bw, y1: y0 + bd, scaled: true };
      }
    }
    return Object.assign({}, buildable, { scaled: false });
  };

  /* Turn the rooms into plan items inside `rect` (metres; the building box maps onto it).
     Rooms without a readable name get a type from their size and are marked `guess`. */
  R.toItems = function (det, rect) {
    const b = det.building, sx = (rect.x1 - rect.x0) / (b.x1 - b.x0), sy = (rect.y1 - rect.y0) / (b.y1 - b.y0);
    // 5 cm steps, rounded inwards so rooms that touch on the drawing do not overlap
    const up = function (v) { return Math.ceil(v * 20 - 1e-6) / 20; }, down = function (v) { return Math.floor(v * 20 + 1e-6) / 20; };
    const list = det.rooms.filter(function (r) { return r.type !== "skip"; }).map(function (r) {
      const x0 = up(rect.x0 + (r.x0 - b.x0) * sx), y0 = up(rect.y0 + (r.y0 - b.y0) * sy);
      const x1 = down(rect.x0 + (r.x1 - b.x0) * sx), y1 = down(rect.y0 + (r.y1 - b.y0) * sy);
      return { rid: r.id, t: r.type, guess: !r.type, text: r.text || "", x: x0, y: y0, w: +(x1 - x0).toFixed(2), h: +(y1 - y0).toFixed(2) };
    });
    // unnamed rooms: small ones are toilets, the largest is the living room, the rest bedrooms
    const unnamed = list.filter(function (it) { return !it.t; }).sort(function (a, c) { return c.w * c.h - a.w * a.h; });
    const hasLiving = list.some(function (it) { return it.t === "living"; });
    unnamed.forEach(function (it, i) {
      const a = it.w * it.h;
      it.t = a < 4.5 ? "toilets" : a < 6.5 ? "store" : !hasLiving && i === 0 ? "living" : "children";
    });
    return list;
  };

  App.PlanRead = R;
})(window.App = window.App || {});
