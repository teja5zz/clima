/* Envelope tools: layered U-value calculator and Eco-Niwas Samhita (ENS 2018) checks. */
(function (App) {
  "use strict";
  const S = App.S;

  // Typical properties: conductivity k [W/m·K], density [kg/m³], specific heat [J/kg·K]
  const MATERIALS = [
    ["Cement plaster", 0.72, 1762, 840],
    ["Lime plaster", 0.70, 1600, 840],
    ["Burnt clay brick", 0.81, 1820, 880],
    ["Fly-ash brick", 0.86, 1700, 840],
    ["AAC block (≈650 kg/m³)", 0.19, 650, 1000],
    ["Solid concrete block", 1.40, 2000, 880],
    ["Compressed stabilised earth block (CSEB)", 0.75, 1800, 880],
    ["Rammed earth", 0.95, 1900, 880],
    ["Granite stone", 2.90, 2650, 820],
    ["Reinforced cement concrete (RCC)", 1.58, 2288, 880],
    ["Cement screed / mortar", 0.72, 1800, 840],
    ["Brick-bat coba / lime concrete", 0.80, 1600, 840],
    ["Clay roof tile", 0.84, 1890, 800],
    ["Extruded polystyrene (XPS)", 0.032, 35, 1450],
    ["Expanded polystyrene (EPS)", 0.038, 20, 1450],
    ["Polyurethane foam (PUF)", 0.026, 35, 1500],
    ["Mineral / glass wool", 0.040, 48, 840],
    ["Gypsum board", 0.25, 900, 1000],
    ["Timber (softwood)", 0.14, 600, 1600],
    ["Unventilated air gap ≥ 25 mm (R = 0.18)", null, 1, 1000],
  ];
  const AIR_R = 0.18;

  // ENS 2018 Part I
  const ENS = {
    coef: { "composite": [6.06, 1.85, 68.99], "hot-dry": [6.06, 1.85, 68.99], "warm-humid": [5.15, 1.31, 65.21], "temperate": [3.38, 0.37, 63.69] },
    wfr: { "composite": 12.5, "hot-dry": 10.0, "warm-humid": 16.66, "temperate": 12.5, "cold": 8.33 },
    retvMax: 15, uRoofMax: 1.2, uColdMax: 1.8,
    orient: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
    omegaHigh: [0.550, 0.829, 1.155, 1.211, 1.089, 1.202, 1.143, 0.821], // latitude ≥ 23.5°N
    omegaLow: [0.659, 0.906, 1.155, 1.125, 0.966, 1.124, 1.156, 0.908],  // latitude < 23.5°N
  };

  let wall = [[0, 12], [2, 230], [0, 12]];
  let roof = [[11, 50], [9, 150], [0, 12]];
  let retv = null;

  App.views.envelope = {
    html: function () {
      const ds = App.state.ds;
      const zone = ds ? ds.nbc.zone : "composite";
      const lat = ds ? ds.meta.lat : 23.5;
      if (!retv) {
        retv = { zone: zone === "cold" ? "cold" : zone, lat: lat >= 23.5 ? "high" : "low",
          rows: ENS.orient.map(function (o, k) { return { opA: [0, 2, 4, 6].indexOf(k) >= 0 ? 60 : 0, opU: 2.0, winA: [0, 2, 4, 6].indexOf(k) >= 0 ? 12 : 0, winU: 5.8, shgc: 0.8, esf: 1 }; }),
          roofU: 2.0, carpet: 100, openable: 12 };
      }
      const zoneOpts = ["composite", "hot-dry", "warm-humid", "temperate", "cold"].map(function (z) {
        return '<option value="' + z + '"' + (retv.zone === z ? " selected" : "") + ">" + S.NBC_ZONES[z].label + "</option>";
      }).join("");
      return App.pageHead("Envelope & ENS calculator", "U-values for typical Indian wall and roof build-ups, and the Eco-Niwas Samhita (ENS) residential envelope checks.") +
        '<div class="two-col">' +
        App.card("Wall build-up", layerEditor("wall") + '<div id="u-wall" class="u-result"></div>') +
        App.card("Roof build-up", layerEditor("roof") + '<div id="u-roof" class="u-result"></div>') + "</div>" +
        '<p class="muted small">Layers are listed outside → inside. Surface resistances follow ISO 6946: walls R<sub>si</sub> 0.13, R<sub>se</sub> 0.04; roofs (downward heat flow, the cooling case) R<sub>si</sub> 0.17, R<sub>se</sub> 0.04 m²K/W. Material values are typical published figures — replace them with tested values (IS 3346 / manufacturer data) for compliance.</p>' +
        App.card("Eco-Niwas Samhita 2018 — RETV & openability check", '<div class="toolbar">' +
          '<div class="field"><label for="r-zone">Climate zone</label><select id="r-zone">' + zoneOpts + "</select></div>" +
          '<div class="field"><label for="r-lat">Latitude</label><select id="r-lat"><option value="high"' + (retv.lat === "high" ? " selected" : "") + '>≥ 23.5° N</option><option value="low"' + (retv.lat === "low" ? " selected" : "") + ">< 23.5° N</option></select></div>" +
          '<div class="field"><label for="r-roofU">Roof U-value (W/m²K)</label><div class="pair"><input id="r-roofU" type="number" step="0.01" value="' + retv.roofU + '"><button class="btn ghost" id="r-useroof" type="button">use roof above</button></div></div>' +
          "</div>" +
          '<div class="table-wrap"><table class="num inputs"><thead><tr><th>Façade</th><th>ω</th><th>Opaque area m²</th><th>U opaque W/m²K</th><th>Window area m²</th><th>U window W/m²K</th><th>SHGC</th><th>External shading factor</th></tr></thead><tbody id="r-body"></tbody></table></div>' +
          '<div class="btn-row"><button class="btn ghost" id="r-usewall" type="button">Apply wall U-value above to all façades</button></div>' +
          '<div class="toolbar"><div class="field"><label for="r-carpet">Carpet area (m²)</label><input id="r-carpet" type="number" step="1" value="' + retv.carpet + '"></div>' +
          '<div class="field"><label for="r-open">Openable window area (m²)</label><input id="r-open" type="number" step="0.1" value="' + retv.openable + '"></div></div>' +
          '<div id="r-out" class="stats"></div>',
          { lead: "RETV (Residential Envelope Transmittance Value) is the net heat gain through the walls and windows per m² of envelope, excluding the roof: <code>RETV = (1/A<sub>env</sub>) × [a·Σ(A<sub>op</sub>·U<sub>op</sub>·ω) + b·Σ(A<sub>win</sub>·U<sub>win</sub>·ω) + c·Σ(A<sub>win</sub>·SHGC<sub>eq</sub>·ω)]</code>, with SHGC<sub>eq</sub> = SHGC × external shading factor." }) +
        '<p class="muted small">Coefficients a, b, c, the RETV limit (15 W/m²), roof U-value limit (1.2 W/m²K), cold-climate U<sub>envelope</sub> limit (1.8 W/m²K) and minimum openable window-to-floor ratios are from ENS 2018 Part I (Bureau of Energy Efficiency). Orientation factors ω are pre-filled from the ENS 2018 annex and can be edited. ENS has been revised (ENS 2021, ENS 2024) — confirm values against the edition notified in your state before submission.</p>';
    },
    mount: function (root) {
      renderLayers(root, "wall"); renderLayers(root, "roof");
      renderRetvRows(root);
      App.$("#r-useroof", root).addEventListener("click", function () { App.$("#r-roofU", root).value = calcU(roof, "roof").U.toFixed(2); calcRetv(root); });
      App.$("#r-usewall", root).addEventListener("click", function () {
        const u = calcU(wall, "wall").U;
        retv.rows.forEach(function (r) { r.opU = +u.toFixed(2); });
        renderRetvRows(root);
      });
      App.$$("#r-zone, #r-lat, #r-roofU, #r-carpet, #r-open", root).forEach(function (e) { e.addEventListener("input", function () { calcRetv(root); }); e.addEventListener("change", function () { renderRetvRows(root); }); });
    },
  };

  function layerEditor(kind) {
    return '<div class="table-wrap"><table class="layers"><thead><tr><th>Material</th><th>Thickness mm</th><th>k W/m·K</th><th></th></tr></thead><tbody id="' + kind + '-layers"></tbody></table></div>' +
      '<button class="btn ghost" type="button" data-add="' + kind + '">+ Add layer</button>';
  }

  function renderLayers(root, kind) {
    const L = kind === "wall" ? wall : roof;
    const body = App.$("#" + kind + "-layers", root);
    body.innerHTML = L.map(function (l, i) {
      const m = MATERIALS[l[0]];
      const k = l[2] != null ? l[2] : m[1];
      return '<tr><td><select data-i="' + i + '" data-f="mat" aria-label="Material">' + MATERIALS.map(function (mm, j) { return '<option value="' + j + '"' + (j === l[0] ? " selected" : "") + ">" + mm[0] + "</option>"; }).join("") + "</select></td>" +
        '<td><input data-i="' + i + '" data-f="t" type="number" min="0" step="1" value="' + l[1] + '" aria-label="Thickness"></td>' +
        "<td>" + (m[1] === null ? '<span class="muted">—</span>' : '<input data-i="' + i + '" data-f="k" type="number" min="0.001" step="0.001" value="' + k + '" aria-label="Conductivity">') + "</td>" +
        '<td><button class="icon-btn" data-i="' + i + '" data-f="del" type="button" aria-label="Remove layer">✕</button></td></tr>';
    }).join("");
    App.$$("[data-f]", body).forEach(function (el) {
      const i = +el.dataset.i;
      const ev = el.tagName === "BUTTON" ? "click" : el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(ev, function () {
        if (el.dataset.f === "del") { L.splice(i, 1); renderLayers(root, kind); return; }
        if (el.dataset.f === "mat") { L[i][0] = +el.value; L[i].length = 2; renderLayers(root, kind); return; }
        if (el.dataset.f === "t") L[i][1] = Math.max(0, +el.value);
        if (el.dataset.f === "k") L[i][2] = Math.max(0.001, +el.value);
        showU(root, kind);
      });
    });
    const add = App.$('[data-add="' + kind + '"]', root);
    add.onclick = function () { L.push([kind === "wall" ? 4 : 13, 50]); renderLayers(root, kind); };
    showU(root, kind);
  }

  function calcU(L, kind) {
    let R = kind === "roof" ? 0.17 + 0.04 : 0.13 + 0.04, C = 0, thick = 0;
    L.forEach(function (l) {
      const m = MATERIALS[l[0]], t = l[1] / 1000;
      thick += t;
      if (m[1] === null) { R += AIR_R; return; }
      const k = l[2] != null ? l[2] : m[1];
      R += t / k; C += m[2] * m[3] * t / 1000;
    });
    return { U: 1 / R, R: R, C: C, thick: thick };
  }

  function showU(root, kind) {
    const r = calcU(kind === "wall" ? wall : roof, kind);
    let verdict = "";
    if (kind === "roof") verdict = r.U <= ENS.uRoofMax ? '<span class="pass">Meets ENS roof limit (≤ 1.2 W/m²K)</span>' : '<span class="fail">Exceeds ENS roof limit of 1.2 W/m²K — add insulation</span>';
    else verdict = r.U <= 0.8 ? '<span class="pass">Well insulated wall</span>' : r.U <= 1.8 ? '<span class="warn-t">Moderate — check RETV below</span>' : '<span class="fail">Poorly insulated — high heat gain</span>';
    App.$("#u-" + kind, root).innerHTML = '<div class="stats inline">' + App.stat("U-value", r.U.toFixed(2) + " W/m²K") + App.stat("Total R", r.R.toFixed(2) + " m²K/W") +
      App.stat("Thickness", (r.thick * 1000).toFixed(0) + " mm") + App.stat("Areal heat capacity", r.C.toFixed(0) + " kJ/m²K", r.C > 200 ? "high thermal mass" : r.C > 100 ? "medium mass" : "lightweight") + "</div>" + verdict;
  }

  function renderRetvRows(root) {
    retv.zone = App.$("#r-zone", root).value; retv.lat = App.$("#r-lat", root).value;
    const om = retv.lat === "high" ? ENS.omegaHigh : ENS.omegaLow;
    retv.rows.forEach(function (r, k) { if (r.omega == null || r.omegaLat !== retv.lat) { r.omega = om[k]; r.omegaLat = retv.lat; } });
    App.$("#r-body", root).innerHTML = retv.rows.map(function (r, k) {
      const f = function (key, step) { return '<td><input data-k="' + k + '" data-f="' + key + '" type="number" min="0" step="' + step + '" value="' + r[key] + '" aria-label="' + ENS.orient[k] + " " + key + '"></td>'; };
      return "<tr><th>" + ENS.orient[k] + "</th>" + f("omega", 0.001) + f("opA", 1) + f("opU", 0.01) + f("winA", 0.5) + f("winU", 0.1) + f("shgc", 0.01) + f("esf", 0.01) + "</tr>";
    }).join("");
    App.$$("#r-body input", root).forEach(function (el) {
      el.addEventListener("input", function () { retv.rows[+el.dataset.k][el.dataset.f] = +el.value; calcRetv(root); });
    });
    calcRetv(root);
  }

  function calcRetv(root) {
    const z = App.$("#r-zone", root).value;
    retv.roofU = +App.$("#r-roofU", root).value; retv.carpet = +App.$("#r-carpet", root).value; retv.openable = +App.$("#r-open", root).value;
    let A = 0, s1 = 0, s2 = 0, s3 = 0, ua = 0;
    retv.rows.forEach(function (r) {
      A += r.opA + r.winA;
      s1 += r.opA * r.opU * r.omega; s2 += r.winA * r.winU * r.omega; s3 += r.winA * r.shgc * r.esf * r.omega;
      ua += r.opA * r.opU + r.winA * r.winU;
    });
    const wfr = retv.carpet > 0 ? 100 * retv.openable / retv.carpet : 0;
    const wfrMin = ENS.wfr[z];
    let out = "";
    if (z === "cold") {
      const uEnv = A > 0 ? ua / A : 0;
      out += App.stat("U<sub>envelope,cold</sub>", uEnv.toFixed(2) + " W/m²K", uEnv <= ENS.uColdMax ? "✓ meets ≤ 1.8 W/m²K" : "✗ exceeds 1.8 W/m²K", uEnv <= ENS.uColdMax ? "good" : "bad");
    } else {
      const c = ENS.coef[z];
      const v = A > 0 ? (c[0] * s1 + c[1] * s2 + c[2] * s3) / A : 0;
      out += App.stat("RETV", v.toFixed(2) + " W/m²", v <= ENS.retvMax ? "✓ meets ≤ 15 W/m²" : "✗ exceeds 15 W/m²", v <= ENS.retvMax ? "good" : "bad");
      const parts = A > 0 ? [c[0] * s1 / A, c[1] * s2 / A, c[2] * s3 / A] : [0, 0, 0];
      out += App.stat("Share: opaque / window U / solar", parts.map(function (p) { return p.toFixed(1); }).join(" / ") + " W/m²", "solar gain through glass is usually the largest lever");
    }
    out += App.stat("Roof U-value", retv.roofU.toFixed(2) + " W/m²K", retv.roofU <= ENS.uRoofMax ? "✓ meets ≤ 1.2 W/m²K" : "✗ exceeds 1.2 W/m²K", retv.roofU <= ENS.uRoofMax ? "good" : "bad");
    out += App.stat("Openable window-to-floor ratio", wfr.toFixed(1) + " %", (wfr >= wfrMin ? "✓" : "✗") + " minimum " + wfrMin + " % for " + S.NBC_ZONES[z].label, wfr >= wfrMin ? "good" : "bad");
    out += App.stat("Window-to-wall ratio", A > 0 ? (100 * retv.rows.reduce(function (s, r) { return s + r.winA; }, 0) / A).toFixed(0) + " %" : "–");
    App.$("#r-out", root).innerHTML = out;
  }
})(window.App);
