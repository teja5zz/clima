/* Outdoor comfort (UTCI scenarios) and heat-stress risk (heat index, hot days). */
(function (App) {
  "use strict";
  const Ch = App.Ch, S = App.S;
  const SCEN = [
    ["utci_Sun_Wind", "In the sun, with wind", "☀ ≋"],
    ["utci_Sun_noWind", "In the sun, no wind", "☀"],
    ["utci_noSun_Wind", "In the shade, with wind", "☂ ≋"],
    ["utci_noSun_noWind", "In the shade, no wind", "☂"],
  ];
  let sel = { sc: "utci_noSun_Wind" };

  App.views.outdoor = {
    html: function () {
      return App.pageHead("Outdoor comfort & heat stress", "How the outdoors feels to a person — and how much shade and breeze change it. Use it for courtyards, verandahs, play areas, streets and workplaces.") +
        App.card("Compare scenarios", '<div id="oc-compare"></div>', { lead: "Universal Thermal Climate Index (UTCI) for a standing person. 'Sun' adds the radiant heat of direct and reflected sunlight; 'no wind' assumes still air (0.5 m/s)." }) +
        '<div class="toolbar"><div class="field"><label for="oc-sc">Scenario</label><select id="oc-sc">' +
        SCEN.map(function (s) { return '<option value="' + s[0] + '">' + s[1] + "</option>"; }).join("") + "</select></div>" + App.timeFilter("oc") + "</div>" +
        App.card("", App.chartBox("oc-cat")) + App.card("", App.chartBox("oc-month")) + App.card("", App.chartBox("oc-val")) +
        App.card("Heat-stress risk", '<div id="hi-stats" class="stats"></div>' + App.chartBox("hi-heat") + App.chartBox("hi-bar"),
          { lead: "The heat index combines air temperature and humidity into a 'feels-like' temperature in the shade (NOAA / US NWS method). Day counts use IMD heat-wave thresholds as an indicator — IMD declares a heat wave from departures against local normals, which a typical-year file cannot reproduce." }) +
        App.card("Designing against heat stress", '<ul class="tips">' +
          "<li>Shade is the single most effective measure: compare the 'sun' and 'shade' scenarios — the gap is the benefit of trees, pergolas, chhatris and deep verandahs.</li>" +
          "<li>Keep air moving: orient streets and courtyards to the prevailing summer wind; avoid enclosed hard-paved spaces.</li>" +
          "<li>Cool the ground: grass, permeable paving and light-coloured (high albedo) surfaces reduce reflected and emitted heat.</li>" +
          "<li>Schedule outdoor work and play in the hours the heatmap shows as 'no' or 'moderate' stress; provide drinking water and shaded rest areas.</li>" +
          "<li>Follow your city's Heat Action Plan (many Indian cities publish one, e.g. Ahmedabad's since 2013).</li></ul>");
    },
    mount: function (root) {
      const ds = App.state.ds;
      App.$("#oc-sc", root).value = sel.sc;
      compare(ds, root);
      const draw = function () {
        sel.sc = App.$("#oc-sc", root).value;
        const mask = Ch.mask(ds, App.readTime("oc"));
        Ch.render("oc-cat", Ch.utciCategoryHeatmap(ds, sel.sc, mask), "utci_categories");
        Ch.render("oc-month", Ch.utciMonthly(ds, sel.sc, mask), "utci_monthly");
        Ch.render("oc-val", Ch.heatmap(ds, sel.sc, { mask: mask, title: "UTCI — " + App.vname(sel.sc).replace("UTCI: ", ""), range: App.range(sel.sc) }), "utci_values");
      };
      App.$$("#oc-sc, #oc-m0, #oc-m1, #oc-h0, #oc-h1", root).forEach(function (e) { e.addEventListener("change", draw); });
      draw();
      heat(ds, root);
    },
  };

  function compare(ds, root) {
    const rows = SCEN.map(function (s) {
      const cat = ds.d[s[0] + "_cat"];
      let ok = 0, hot = 0, cold = 0;
      for (let i = 0; i < ds.n; i++) { if (cat[i] === 0) ok++; else if (cat[i] >= 2) hot++; else if (cat[i] <= -2) cold++; }
      return { s: s, ok: ok, hot: hot, cold: cold };
    });
    const best = rows.reduce(function (a, b) { return b.ok > a.ok ? b : a; });
    App.$("#oc-compare", root).innerHTML = '<div class="scen-grid">' + rows.map(function (r) {
      return '<div class="scen' + (r === best ? " best" : "") + '"><div class="scen-ic" aria-hidden="true">' + r.s[2] + "</div><h3>" + r.s[1] + "</h3>" +
        '<div class="bar3"><span class="b-ok" style="width:' + (100 * r.ok / ds.n) + '%"></span><span class="b-hot" style="width:' + (100 * r.hot / ds.n) + '%"></span><span class="b-cold" style="width:' + (100 * r.cold / ds.n) + '%"></span></div>' +
        "<p><strong>" + (100 * r.ok / ds.n).toFixed(0) + " %</strong> no thermal stress<br>" + (100 * r.hot / ds.n).toFixed(0) + " % strong heat stress or worse<br>" +
        (100 * r.cold / ds.n).toFixed(0) + " % moderate cold stress or worse</p>" + (r === best ? '<span class="badge">most comfortable</span>' : "") + "</div>";
    }).join("") + "</div>";
  }

  function heat(ds, root) {
    const d = ds.d, L = S.HEAT_INDEX_LEVELS;
    const dmax = ds.daily.max;
    const c40 = dmax.filter(function (v) { return v >= 40; }).length, c45 = dmax.filter(function (v) { return v >= 45; }).length;
    const c37 = dmax.filter(function (v) { return v >= 37; }).length;
    let danger = 0; for (let i = 0; i < ds.n; i++) if (d.heat_index[i] >= 41) danger++;
    let warmNights = 0; for (let day = 0; day < 365; day++) if (ds.daily.min[day] >= 28) warmNights++;
    App.$("#hi-stats", root).innerHTML =
      App.stat("Days max ≥ 40 °C", c40, "plains heat-wave threshold") + App.stat("Days max ≥ 45 °C", c45, "severe heat") +
      App.stat("Days max ≥ 37 °C", c37, "coastal heat-wave threshold") + App.stat("Hours heat index ≥ 41 °C", danger, "'danger' level") +
      App.stat("Warm nights (min ≥ 28 °C)", warmNights, "little night-time relief");
    const cs = [];
    const edges = [-10, 27, 32, 41, 54, 70];
    L.forEach(function (l, k) { cs.push([(edges[k] + 10) / 80, l.color]); cs.push([(edges[k + 1] + 10) / 80, l.color]); });
    const f = Ch.heatmap(ds, "heat_index", { title: "Heat index — hourly ('feels-like' in shade)", colorscale: cs, range: [App.conv("DBT", -10), App.conv("DBT", 70)] });
    f.data[0].colorbar = { tickvals: [27, 32, 41, 54].map(function (v) { return App.conv("DBT", v); }), ticktext: ["27", "32", "41", "54"].map(function (v) { return v + " °C"; }), thickness: 14, title: { text: "Heat index" } };
    Ch.render("hi-heat", f, "heat_index");
    const cnt = L.map(function () { return new Array(12).fill(0); });
    for (let i = 0; i < ds.n; i++) {
      const hi = d.heat_index[i];
      let k = 0; while (hi > L[k].max) k++;
      cnt[k][d.month[i] - 1]++;
    }
    Ch.render("hi-bar", { data: L.map(function (l, k) {
      return { type: "bar", x: S.MONTHS, y: cnt[k], name: l.label, marker: { color: l.color }, hovertemplate: "%{x}: %{y} h<extra>" + l.label + "</extra>" };
    }), layout: { barmode: "stack", height: 320, title: { text: "Hours per month by heat-index level", x: 0.01, font: { size: 14 } }, yaxis: { title: "Hours", gridcolor: Ch.GRID } } }, "heat_index_monthly");
  }
})(window.App);
