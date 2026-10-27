// Run with: node --test website/tests/science.test.js
// Reference values generated with pythermalcomfort 2.9.1 and pvlib 0.16.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = global;
global.btoa = (s) => Buffer.from(s, "binary").toString("base64");
global.atob = (s) => Buffer.from(s, "base64").toString("binary");
for (const f of ["core/utci-poly.js", "core/science.js", "core/variables.js", "core/epw.js", "core/siting.js", "data/vastu.js", "core/planner.js", "core/strategies.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), { filename: f });
}
const S = global.App.S;
const ref = require("./reference-values.json");

test("UTCI matches pythermalcomfort", () => {
  for (const [t, tr, v, rh, u] of ref.utci) assert.ok(Math.abs(S.utci(t, tr, v, rh) - u) < 0.051, `utci(${t},${tr},${v},${rh})`);
});

test("SolarCal delta MRT matches pythermalcomfort", () => {
  for (const [alt, dni, d] of ref.solarGain) assert.ok(Math.abs(S.solarDeltaMrt(alt, 45, dni) - d) < 0.051);
});

test("solar position within 0.1 degree of pvlib", () => {
  for (const [lat, lon, tz, doy, h, el, , az] of ref.sun) {
    const p = S.solarPosition(doy, h, lat, lon, tz);
    assert.ok(Math.abs(p.elevation - el) < 0.1);
    assert.ok(Math.abs(((p.azimuth - az + 540) % 360) - 180) < 0.1);
  }
});

test("NBC climate classification", () => {
  const m = (tMax, rh) => ({ tMax, rh });
  assert.strictEqual(S.classifyMonth(38, 30), "hot-dry");
  assert.strictEqual(S.classifyMonth(33, 70), "warm-humid");
  assert.strictEqual(S.classifyMonth(28, 80), "warm-humid");
  assert.strictEqual(S.classifyMonth(28, 60), "temperate");
  assert.strictEqual(S.classifyMonth(20, 60), "cold");
  assert.strictEqual(S.classifyNbc(Array(12).fill(m(32, 80))).zone, "warm-humid");
  const mixed = [m(20, 50), m(24, 50), m(33, 30), m(40, 20), m(42, 25), m(38, 60), m(33, 80), m(32, 80), m(33, 70), m(33, 50), m(28, 50), m(22, 50)];
  assert.strictEqual(S.classifyNbc(mixed).zone, "composite");
});

test("IMAC equations", () => {
  assert.ok(Math.abs(S.imac(25, "nv").cmf - (0.54 * 25 + 12.83)) < 1e-9);
  assert.ok(Math.abs(S.imac(25, "mm").up - (0.28 * 25 + 17.87 + 3.46)) < 1e-9);
});

test("EPW parsing of the repository sample file", () => {
  const epw = fs.readFileSync(path.join(__dirname, "..", "..", "tests", "python", "ITA_ER_Bologna-Marconi.AP.161400_TMYx.2004-2018.epw"), "utf8");
  const ds = global.App.parseEpw(epw, "sample.epw");
  assert.strictEqual(ds.n, 8760);
  assert.strictEqual(ds.meta.period, "2004-2018");
  assert.ok(Math.abs(ds.meta.lat - 44.5308) < 1e-6);
  assert.strictEqual(ds.monthly.length, 12);
  assert.ok(ds.d.utci_Sun_Wind.every(Number.isFinite));
});

test("Vastu scores follow the wheel's quick reference", () => {
  const A = global.App;
  const room = (id) => A.VASTU_ROOMS.find((r) => r.id === id);
  assert.strictEqual(A.vastuScore(room("kitchen"), "SE"), 1);
  assert.strictEqual(A.vastuScore(room("kitchen"), "NW"), 0.65);
  assert.strictEqual(A.vastuScore(room("kitchen"), "NE"), 0);
  assert.strictEqual(A.vastuVerdict(room("pooja"), "NE"), "Preferred");
  assert.strictEqual(A.vastuVerdict(room("kitchen"), "NW"), "Acceptable");
  assert.strictEqual(A.vastuVerdict(room("toilets"), "C"), "Avoid");
  assert.strictEqual(A.VASTU_ZONES.length, 8);
});

function bologna() {
  const epw = fs.readFileSync(path.join(__dirname, "..", "..", "tests", "python", "ITA_ER_Bologna-Marconi.AP.161400_TMYx.2004-2018.epw"), "utf8");
  return global.App.siteMetrics(global.App.parseEpw(epw, "sample.epw"));
}

test("siting metrics and science scores", () => {
  const A = global.App;
  const m = bologna();
  // in the northern hemisphere, the north façade gets the least afternoon sun and south panels yield most
  const k = (d) => A.DIRS8.indexOf(d);
  assert.ok(m.raw.pmHotSun[k("N")] < m.raw.pmHotSun[k("SW")]);
  assert.strictEqual(m.raw.roofSolar.indexOf(Math.max(...m.raw.roofSolar)), k("S"));
  assert.ok(m.raw.amSun[k("E")] > m.raw.amSun[k("W")]);
  for (const r of A.VASTU_ROOMS) {
    const sc = A.scienceScores(m, r.sci);
    if (!sc) continue;
    assert.strictEqual(sc.score.length, 8);
    sc.score.forEach((v) => assert.ok(v >= 0 && v <= 1));
  }
});

test("planner geometry: facing, zones and façades", () => {
  const P = global.App.Plan;
  const site = P.defaultSite(); // 40 × 60 ft, road side faces east
  const { W, D } = site;
  assert.strictEqual(P.zoneAt(site, W / 2, D - 0.1), "E"); // road edge = east
  assert.strictEqual(P.zoneAt(site, W / 2, 0.1), "W");
  assert.strictEqual(P.zoneAt(site, 0.1, D / 2), "S"); // with east at the bottom, south is on the left
  assert.strictEqual(P.zoneAt(site, W - 0.1, D / 2), "N");
  assert.strictEqual(P.zoneAt(site, W / 2, D / 2), "C");
  assert.strictEqual(P.sideDir(site, "top"), P.DIRS.indexOf("W"));
  for (const [facing, bottom] of [[0, "N"], [180, "S"], [270, "W"], [45, "NE"]]) {
    assert.strictEqual(P.zoneAt({ ...site, facing }, W / 2, D - 0.1), bottom);
  }
  // fine-tune turns the road side to the exact bearing facing + fine
  assert.strictEqual(P.azOfBearing({ ...site, facing: 90, fine: 20 }, 180), 110);
  const b = P.buildable(site);
  const fac = P.facades(site, { t: "master", x: b.x0, y: b.y0, w: 3, h: 3 }).map((f) => P.DIRS[f.k]).sort();
  assert.deepStrictEqual(fac, ["S", "W"]);
});

test("auto-arrange gives valid plans for every house type and facing", () => {
  const A = global.App, P = A.Plan, m = bologna();
  for (const preset of A.VASTU_PRESETS) {
    for (const facing of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const site = { ...P.defaultSite(), facing };
      if (preset.id === "villa") { site.W = 50 * P.FT; site.D = 80 * P.FT; }
      if (preset.id === "1bhk") { site.W = 30 * P.FT; site.D = 40 * P.FT; } // small plots use a 2 × 2 grid
      const ctx = { site, metrics: m, weight: 0.5 };
      const items = P.autoArrange(ctx, P.fromPreset(preset.id));
      assert.strictEqual(items.length, preset.items.length);
      const ev = P.evaluate(ctx, items);
      const errors = ev.issues.filter((i) => i.sev === "error");
      assert.deepStrictEqual(errors, [], preset.id + " facing " + facing);
      if (preset.id !== "villa") assert.deepStrictEqual(ev.issues.filter((i) => i.sev === "warn"), [], preset.id + " facing " + facing);
      assert.ok(ev.vastu > 0.7, preset.id + " facing " + facing + " vastu " + ev.vastu);
      // the main entrance is always on the road side, and the kitchen is never in the north-east
      const door = ev.scored.find((r) => r.it.t === "entrance");
      assert.strictEqual(P.doorSide(site, door.it), "bottom");
      assert.notStrictEqual(ev.scored.find((r) => r.it.t === "kitchen").s.zone, "NE");
    }
  }
});

test("plan checks catch overlaps, setbacks and a misplaced door", () => {
  const P = global.App.Plan, site = P.defaultSite(), b = P.buildable(site);
  const ctx = { site, metrics: null, weight: 1 };
  const items = [
    { uid: "a", t: "living", x: b.x0, y: b.y0, w: 4, h: 4 },
    { uid: "b", t: "kitchen", x: b.x0 + 2, y: b.y0 + 2, w: 3, h: 3 },
    { uid: "c", t: "toilets", x: 0, y: b.y0, w: 1.5, h: 1.5 },
    { uid: "d", t: "entrance", x: b.x0 + 1, y: b.y0 },
  ];
  const ev = P.evaluate(ctx, items);
  const has = (re) => ev.issues.some((i) => re.test(i.text));
  assert.ok(has(/overlaps Kitchen/));
  assert.ok(has(/Toilet.*setback/));
  assert.ok(has(/entrance is not on a road side/));
  assert.ok(has(/Toilet.*below the NBC/));
  assert.strictEqual(ev.climate, null); // no weather file: Vastu only
});

test("squarified tiling fills the box without overlaps", () => {
  const P = global.App.Plan;
  const areas = [16, 11, 8.5, 4, 2.5];
  const W = 5, H = 42 / 5;
  const r = P.squarifyMin(areas.map((a) => a * (W * H) / 42), W, H, 1.5);
  assert.strictEqual(r.length, areas.length);
  for (let i = 0; i < r.length; i++) {
    assert.ok(r[i].x >= -1e-9 && r[i].y >= -1e-9 && r[i].x + r[i].w <= W + 1e-9 && r[i].y + r[i].h <= H + 1e-9);
    for (let j = i + 1; j < r.length; j++) assert.strictEqual(P.overlap(r[i], r[j]), 0);
  }
});

test("plans survive a share link round trip", () => {
  const P = global.App.Plan;
  const state = { site: { ...P.defaultSite(), facing: 225, fine: -7, corner: "left" }, items: P.fromPreset("2bhk"), weight: 0.35 };
  state.items[1].n = "Hall — ಹಾಲ್";
  const back = P.deserialize(P.serialize(state));
  assert.strictEqual(back.site.facing, 225);
  assert.strictEqual(back.site.fine, -7);
  assert.strictEqual(back.site.corner, "left");
  assert.strictEqual(back.weight, 0.35);
  assert.strictEqual(back.items.length, state.items.length);
  assert.strictEqual(back.items[1].n, "Hall — ಹಾಲ್");
  assert.throws(() => P.deserialize("not-a-plan"));
  assert.throws(() => P.unpack({ v: 2, W: "x", D: 10, f: 0, sb: [0, 0, 0, 0], i: [] }));
});

test("climate strategies for a plan", () => {
  const A = global.App, P = A.Plan;
  const epw = fs.readFileSync(path.join(__dirname, "..", "..", "tests", "python", "ITA_ER_Bologna-Marconi.AP.161400_TMYx.2004-2018.epw"), "utf8");
  const ds = A.parseEpw(epw, "sample.epw"), m = A.siteMetrics(ds);
  const site = P.defaultSite(), items = P.autoArrange({ site, metrics: m, weight: 0.5 }, P.fromPreset("3bhk"));
  const s = A.planStrategies(ds, m, site, items);
  assert.strictEqual(s.sides.length, 4);
  // road side of an east-facing plot is the bottom of the drawing
  assert.strictEqual(s.sides.find((x) => x.side === "bottom").dir, "E");
  for (const x of s.sides) {
    assert.ok(["high", "mid", "low"].includes(x.heat));
    assert.ok(x.shade.depth >= 300 && x.shade.depth <= 1200, x.side + " " + x.shade.depth);
    assert.ok(x.wall.text && x.window && x.plant.text);
  }
  // in the northern hemisphere a north wall gets less hot-hour sun than a south wall
  const shade = A.planStrategies.shadeFor;
  assert.ok(shade(ds, 0).kwh < shade(ds, 180).kwh);
  assert.ok(shade(ds, 270).hours > 0);
  assert.ok(s.sides.filter((x) => x.windward).length <= 1 && s.sides.filter((x) => x.leeward).length <= 1);
  assert.ok(s.vent.comfortShare > 0 && s.vent.comfortShare < 1);
  assert.ok(s.key.length >= 3 && s.roof.text);
  const ids = new Set(items.map((it) => it.uid));
  s.vent.inlets.concat(s.vent.outlets, s.vent.single).forEach((u) => assert.ok(ids.has(u)));
});

test("windows, walls, roof and checklist for keeping cool", () => {
  const A = global.App, P = A.Plan;
  const epw = fs.readFileSync(path.join(__dirname, "..", "..", "tests", "python", "ITA_ER_Bologna-Marconi.AP.161400_TMYx.2004-2018.epw"), "utf8");
  const ds = A.parseEpw(epw, "sample.epw"), m = A.siteMetrics(ds);
  for (const units of ["ft", "m"]) {
    const site = { ...P.defaultSite(), units }, items = P.autoArrange({ site, metrics: m, weight: 0.5 }, P.fromPreset("3bhk"));
    const s = A.planStrategies(ds, m, site, items);
    const fp = P.footprint(site, items);
    // every room that needs light and air and has an outside wall gets at least one opening on an outside wall
    for (const it of items.filter((x) => A.VASTU_ROOM[x.t].habitable && P.facades(site, x, null, fp).length)) {
      const list = s.roomWin[it.uid].list;
      assert.ok(list.length >= 1, it.t + " has no window");
      const sides = P.facades(site, it, null, fp).map((f) => f.side);
      list.forEach((w) => assert.ok(sides.includes(w.side)));
      assert.ok(s.roomWin[it.uid].area >= 0.08 * it.w * it.h, it.t + " window area " + s.roomWin[it.uid].area);
    }
    // inlets only on the windward wall, outlets only on the leeward wall
    for (const w of s.windows) {
      if (w.role === "inlet") assert.strictEqual(w.side, s.vent.windward);
      if (w.role === "outlet") assert.strictEqual(w.side, s.vent.leeward);
    }
    s.sides.forEach((x) => assert.ok(x.wall.mm >= 150 && x.wall.mm <= 300 && x.wall.build));
    assert.ok(s.roofOptions.length >= 3);
    assert.ok(s.checks.some((c) => c.status !== "tip") && s.checks.some((c) => c.status === "tip"));
    assert.ok(s.vent.crossCount <= s.vent.habitable);
  }
});
