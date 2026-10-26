/* Psychrometric chart with filters, colour-by variable and an adjustable comfort zone. */
(function (App) {
  "use strict";
  const Ch = App.Ch, S = App.S;
  let sel = null;

  App.views.psychro = {
    html: function () {
      const ds = App.state.ds;
      if (!sel || sel.ds !== ds) {
        const c = S.imac(S.mean(ds.daily.mean), "nv");
        sel = { ds: ds, color: "none", t0: Math.round(c.low * 2) / 2, t1: Math.round(c.up * 2) / 2, rh: 80, w: 12 };
      }
      const t = App.tUnit();
      return App.pageHead("Psychrometric chart", "Temperature and moisture together — the basis for choosing between ventilation, evaporative cooling, dehumidification and heating.") +
        '<div class="toolbar">' + App.timeFilter("pc") +
        '<div class="field"><label for="pc-color">Colour by</label><select id="pc-color">' + App.varOptions(sel.color, null, true) + "</select></div></div>" +
        '<div class="toolbar">' +
        '<div class="field"><label for="pc-t0">Comfort zone from (' + t + ')</label><input id="pc-t0" type="number" step="0.5" value="' + App.fmt(App.conv("DBT", sel.t0)) + '"></div>' +
        '<div class="field"><label for="pc-t1">to (' + t + ')</label><input id="pc-t1" type="number" step="0.5" value="' + App.fmt(App.conv("DBT", sel.t1)) + '"></div>' +
        '<div class="field"><label for="pc-rh">Max RH (%)</label><input id="pc-rh" type="number" step="5" min="10" max="100" value="' + sel.rh + '"></div>' +
        '<div class="field"><label for="pc-w">Max humidity ratio (g/kg)</label><input id="pc-w" type="number" step="0.5" value="' + sel.w + '"></div>' +
        "</div>" +
        App.card("", App.chartBox("pc-chart", "tall") + '<div id="pc-note" class="note"></div>',
          { lead: "The default comfort zone is the IMAC naturally-ventilated 90 % band at this site's annual mean temperature, capped at 80 % RH and 12 g/kg. Edit the numbers to test your own criteria." }) +
        App.card("Reading the chart", '<div class="why-grid">' +
          "<div><h3>Right of the zone, low on the chart</h3><p>Hot and dry: evaporative cooling (desert coolers, water bodies, wet jaalis), thermal mass and night ventilation work well.</p></div>" +
          "<div><h3>Right of the zone, high on the chart</h3><p>Hot and humid: maximise air movement (cross-ventilation, ceiling fans), shade everything; evaporative cooling will not help.</p></div>" +
          "<div><h3>Above the zone</h3><p>Too much moisture: dehumidification or high air speed is needed; avoid cold surfaces that can condense.</p></div>" +
          "<div><h3>Left of the zone</h3><p>Cool to cold: passive solar gain, insulation and air-tightness.</p></div></div>");
    },
    mount: function (root) {
      const ds = App.state.ds;
      const draw = function () {
        sel.color = App.$("#pc-color", root).value;
        sel.t0 = App.toSi("DBT", +App.$("#pc-t0", root).value); sel.t1 = App.toSi("DBT", +App.$("#pc-t1", root).value);
        sel.rh = +App.$("#pc-rh", root).value; sel.w = +App.$("#pc-w", root).value;
        const mask = Ch.mask(ds, App.readTime("pc"));
        const f = Ch.psychro(ds, mask, sel.color, { zone: { t0: sel.t0, t1: sel.t1, rhMax: sel.rh, wMax: sel.w, label: "Comfort zone" } });
        Ch.render("pc-chart", f, "psychrometric_chart");
        App.$("#pc-note", root).innerHTML = "<strong>" + (f.count ? (100 * f.inZone / f.count).toFixed(0) : 0) + " %</strong> of the " + f.count + " selected hours fall inside the comfort zone outdoors, without any design intervention.";
      };
      App.$$("select, input", App.$(".toolbar", root).parentNode).forEach(function (e) { e.addEventListener("change", draw); });
      draw();
    },
  };
})(window.App);
