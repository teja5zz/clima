/* India: NBC 2016 / ECBC climate-zone classification and IMAC adaptive comfort. */
(function (App) {
  "use strict";
  const Ch = App.Ch, S = App.S;
  let mode = "nv";

  const IMPLICATIONS = {
    "hot-dry": "Reduce solar gain and use thermal mass with night ventilation; promote evaporative cooling; compact planning with shaded courtyards; small, well-shaded openings on east and west.",
    "warm-humid": "Maximise cross-ventilation and air movement; shade all openings and walls; lightweight, low-mass construction or well-ventilated roofs; avoid moisture traps; raise floors in flood-prone sites.",
    "composite": "Design for both seasons: shade and insulate against summer heat, allow winter sun to the south, use operable openings for monsoon ventilation and thermal mass for diurnal swings.",
    "temperate": "Moderate climate with mild winters: shading and good ventilation give comfort most of the year; avoid over-glazing on west façades.",
    "cold": "Conserve heat: insulate walls and roof, keep buildings compact and airtight, maximise south-facing glazing for solar gain, and use thermal mass (Trombe walls, sunspaces).",
  };

  App.views.india = {
    html: function () {
      const ds = App.state.ds;
      const z = S.NBC_ZONES[ds.nbc.zone];
      return App.pageHead("Climate zone & IMAC comfort", "Indian climate classification and the India Model for Adaptive Comfort, both computed from your weather file.") +
        '<section class="card zone-hero" style="--z:' + z.color + '"><div><p class="eyebrow">NBC 2016 / ECBC 2017 climate zone</p><h2 class="zone-name">' + z.label + "</h2>" +
        "<p>" + (ds.nbc.zone === "composite" ? "No single climate type prevails for six months or more, so the site is classified <strong>Composite</strong>." :
          "<strong>" + ds.nbc.counts[ds.nbc.zone] + " of 12 months</strong> meet the " + z.label + " criterion (" + z.rule + ").") + "</p>" +
        refZone(ds) +
        '<p class="muted small">Classification follows the criteria of the National Building Code of India 2016 (Part 8, Sec. 1) and Bansal & Minke (1988), applied to this file\'s monthly mean maximum temperature and daytime (09–18 h) humidity — a combination that reproduced the official zone for 11 of 12 reference cities we tested. Official code compliance uses the zone listed for your city in the code annex — where they differ, follow the code annex.</p></div>' +
        '<div class="month-chips">' + ds.nbc.months.map(function (m, i) {
          const mz = S.NBC_ZONES[m];
          return '<div class="mchip" style="--z:' + mz.color + '" title="' + mz.label + '"><span>' + S.MONTHS[i] + "</span><b>" + mz.label + "</b></div>";
        }).join("") + "</div></section>" +
        '<div class="two-col">' + App.card("", App.chartBox("in-sig")) +
        App.card("What this means for design", "<p>" + IMPLICATIONS[ds.nbc.zone] + "</p>" + rulesTable() +
          '<p><a class="btn" href="#/strategies">Get site-specific strategies →</a></p>') + "</div>" +
        App.card("India Model for Adaptive Comfort (IMAC)", '<div class="toolbar"><div class="field"><label for="in-mode">Building operation</label><select id="in-mode">' +
          '<option value="nv">Naturally ventilated</option><option value="mm">Mixed-mode (fans / AC as needed)</option></select></div></div>' +
          '<div id="in-stats" class="stats"></div>' + App.chartBox("in-year") + App.chartBox("in-month") + '<div id="in-table"></div>',
          { lead: "IMAC (Manu et al., 2016) was derived from 6,330 survey responses in 16 Indian offices across five climate zones and is adopted in NBC 2016 Part 8. Comfort temperature follows the 30-day running mean of outdoor air temperature: <code>T<sub>comf</sub> = 0.54·T<sub>30</sub> + 12.83</code> (naturally ventilated, ±2.38 °C for 90 % acceptability) and <code>T<sub>comf</sub> = 0.28·T<sub>30</sub> + 17.87</code> (mixed-mode, ±3.46 °C)." });
    },
    mount: function (root) {
      const ds = App.state.ds;
      Ch.render("in-sig", Ch.nbcZones(ds), "nbc_climate_signature");
      App.$("#in-mode", root).value = mode;
      const draw = function () {
        mode = App.$("#in-mode", root).value;
        const p = S.IMAC[mode], d = ds.d;
        const lo = d["imac_" + mode + "_low"], up = d["imac_" + mode + "_up"];
        const inb = new Array(12).fill(0), hot = new Array(12).fill(0), cold = new Array(12).fill(0);
        let tin = 0, th = 0, tc = 0, outside = 0;
        for (let i = 0; i < ds.n; i++) {
          const m = d.month[i] - 1;
          if (d.DBT[i] > up[i]) { hot[m]++; th++; } else if (d.DBT[i] < lo[i]) { cold[m]++; tc++; } else { inb[m]++; tin++; }
          if (d.t30[i] < p.applicable[0] || d.t30[i] > p.applicable[1]) outside++;
        }
        const pc = function (v) { return (100 * v / ds.n).toFixed(0) + " %"; };
        App.$("#in-stats", root).innerHTML = App.stat("Outdoor air within comfort band", pc(tin), "hours when " + (mode === "nv" ? "opening windows can deliver comfort" : "fans / ventilation can suffice"), "good") +
          App.stat("Warmer than band", pc(th), "need shading, mass, fans or cooling") + App.stat("Cooler than band", pc(tc), "need solar gain, insulation or heating") +
          App.stat("Days outside model range", Math.round(outside / 24), "30-day mean outside " + p.applicable[0] + "–" + p.applicable[1] + " °C");
        Ch.render("in-year", Ch.yearly(ds, "DBT", "imac-" + mode), "imac_" + mode);
        Ch.render("in-month", { data: [
          { type: "bar", x: S.MONTHS, y: inb.map(function (v, m) { return 100 * v / (inb[m] + hot[m] + cold[m]); }), name: "Within band", marker: { color: "#2f9e44" }, hovertemplate: "%{y:.0f}%<extra>within</extra>" },
          { type: "bar", x: S.MONTHS, y: hot.map(function (v, m) { return 100 * v / (inb[m] + hot[m] + cold[m]); }), name: "Warmer", marker: { color: "#e8590c" }, hovertemplate: "%{y:.0f}%<extra>warmer</extra>" },
          { type: "bar", x: S.MONTHS, y: cold.map(function (v, m) { return 100 * v / (inb[m] + hot[m] + cold[m]); }), name: "Cooler", marker: { color: "#4a6fb5" }, hovertemplate: "%{y:.0f}%<extra>cooler</extra>" },
        ], layout: { barmode: "stack", height: 320, title: { text: "Outdoor hours relative to the IMAC band, by month", x: 0.01, font: { size: 14 } }, yaxis: { ticksuffix: "%", range: [0, 100], gridcolor: Ch.GRID } } }, "imac_monthly");
        let h = '<div class="table-wrap"><table class="num"><thead><tr><th>Month</th><th>30-day mean ' + App.tUnit() + "</th><th>IMAC comfort " + App.tUnit() + "</th><th>90 % band " + App.tUnit() + "</th><th>ASHRAE 55 comfort " + App.tUnit() + "</th></tr></thead><tbody>";
        for (let m = 1; m <= 12; m++) {
          const day = S.doyOf(m, 15) - 1, i = day * 24;
          h += "<tr><td>" + S.MONTHS[m - 1] + " (15th)</td><td>" + App.fmt(App.conv("DBT", d.t30[i])) + "</td><td><strong>" + App.fmt(App.conv("DBT", d["imac_" + mode][i])) + "</strong></td><td>" +
            App.fmt(App.conv("DBT", lo[i])) + " – " + App.fmt(App.conv("DBT", up[i])) + "</td><td>" + App.fmt(App.conv("DBT", d.adaptive_cmf[i])) + "</td></tr>";
        }
        App.$("#in-table", root).innerHTML = h + '</tbody></table></div><p class="muted small">Use these indoor operative-temperature targets for set-points, fan-assisted design and overheating checks. The ASHRAE 55 adaptive comfort temperature uses a 7-day weighted running mean.</p>';
      };
      App.$("#in-mode", root).addEventListener("change", draw);
      draw();
    },
  };

  // Indicative code-annex zone of the nearest listed city (within 60 km), for a cross-check.
  function refZone(ds) {
    const m = ds.meta;
    let best = null, bd = Infinity;
    App.INDIA_CITIES.forEach(function (c) {
      const d = Math.hypot((c.lat - m.lat) * 111, (c.lon - m.lon) * 111 * Math.cos(m.lat * Math.PI / 180));
      if (d < bd) { bd = d; best = c; }
    });
    if (!best || bd > 60 || !best.zone) return "";
    const z = S.NBC_ZONES[best.zone];
    const same = best.zone === ds.nbc.zone;
    return '<p class="small">Reference zone for <strong>' + App.esc(best.city) + '</strong> in the NBC / ECBC climate map: <span class="zone-chip" style="--z:' + z.color + '">' + z.label + "</span> " +
      (same ? '<span class="agree">✓ matches this file</span>' : '<span class="partial">◐ differs — typical-year files can shift borderline months; use the code zone for compliance and this analysis for design.</span>') + "</p>";
  }

  function rulesTable() {
    return '<div class="table-wrap"><table><thead><tr><th>Zone</th><th>Criterion (monthly means)</th></tr></thead><tbody>' +
      ["hot-dry", "warm-humid", "temperate", "cold", "composite"].map(function (k) {
        const z = S.NBC_ZONES[k];
        return '<tr><td><span class="zone-chip" style="--z:' + z.color + '">' + z.label + "</span></td><td>" + z.rule + "</td></tr>";
      }).join("") + '</tbody></table></div><p class="muted small">A zone is assigned when its criterion holds for six months or more.</p>';
  }
})(window.App);
