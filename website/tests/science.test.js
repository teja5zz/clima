// Run with: node --test website/tests/science.test.js
// Reference values generated with pythermalcomfort 2.9.1 and pvlib 0.16.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

global.window = global;
for (const f of ["core/utci-poly.js", "core/science.js", "core/variables.js", "core/epw.js"]) {
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
