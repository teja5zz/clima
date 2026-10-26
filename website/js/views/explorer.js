/* Data explorer: any variable, filtered heatmaps, two-variable scatter. */
(function (App) {
  "use strict";
  const Ch = App.Ch;
  let sel = { key: "DBT", fkey: "glob_hor_rad", x: "DBT", y: "RH", c: "glob_hor_rad" };

  App.views.explorer = {
    html: function () {
      return App.pageHead("Data explorer", "Every variable in the weather file, plus the derived comfort and solar metrics.") +
        App.card("Single variable", '<div class="toolbar"><div class="field"><label for="ex-var">Variable</label><select id="ex-var">' + App.varOptions(sel.key) + "</select></div></div>" +
          App.chartBox("ex-year") + App.chartBox("ex-daily") + App.chartBox("ex-heat")) +
        App.card("Filtered heatmap", '<div class="toolbar">' +
          '<div class="field"><label for="ex-fvar">Show</label><select id="ex-fvar">' + App.varOptions(sel.fkey) + "</select></div>" + App.timeFilter("exf") +
          '<div class="field"><label for="ex-cond">Only where</label><select id="ex-cond">' + App.varOptions("DBT", null, true) + "</select></div>" +
          '<div class="field"><label>between</label><div class="pair"><input id="ex-min" type="number" placeholder="min" aria-label="Minimum"><span>and</span><input id="ex-max" type="number" placeholder="max" aria-label="Maximum"></div></div></div>' +
          App.chartBox("ex-fheat") + '<p id="ex-fnote" class="note"></p>',
          { lead: "Example: show global radiation only during working hours (10–17 h) in summer months when it is hotter than 30 °C — the hours a façade most needs shading." }) +
        App.card("Compare two variables", '<div class="toolbar">' +
          '<div class="field"><label for="ex-x">X axis</label><select id="ex-x">' + App.varOptions(sel.x) + "</select></div>" +
          '<div class="field"><label for="ex-y">Y axis</label><select id="ex-y">' + App.varOptions(sel.y) + "</select></div>" +
          '<div class="field"><label for="ex-c">Colour</label><select id="ex-c">' + App.varOptions(sel.c, null, true) + "</select></div>" + App.timeFilter("exs") + "</div>" +
          App.chartBox("ex-scatter"));
    },
    mount: function (root) {
      const ds = App.state.ds;
      const one = function () {
        sel.key = App.$("#ex-var", root).value;
        Ch.render("ex-year", Ch.yearly(ds, sel.key, null), "annual_" + sel.key);
        Ch.render("ex-daily", Ch.daily(ds, sel.key), "daily_" + sel.key);
        Ch.render("ex-heat", Ch.heatmap(ds, sel.key), "heatmap_" + sel.key);
      };
      const filt = function () {
        sel.fkey = App.$("#ex-fvar", root).value;
        const f = App.readTime("exf");
        const ck = App.$("#ex-cond", root).value;
        if (ck !== "none") { f.varKey = ck; f.vMin = parseFloat(App.$("#ex-min", root).value); f.vMax = parseFloat(App.$("#ex-max", root).value); }
        const mask = Ch.mask(ds, f);
        let n = 0; for (const v of mask) n += v;
        Ch.render("ex-fheat", Ch.heatmap(ds, sel.fkey, { mask: mask }), "filtered_" + sel.fkey);
        App.$("#ex-fnote", root).textContent = n + " of " + ds.n + " hours (" + (100 * n / ds.n).toFixed(1) + " %) match the filter.";
      };
      const sc = function () {
        sel.x = App.$("#ex-x", root).value; sel.y = App.$("#ex-y", root).value; sel.c = App.$("#ex-c", root).value;
        Ch.render("ex-scatter", Ch.scatter(ds, sel.x, sel.y, sel.c, Ch.mask(ds, App.readTime("exs"))), "scatter");
      };
      App.$("#ex-var", root).addEventListener("change", one);
      App.$$("#ex-fvar, #exf-m0, #exf-m1, #exf-h0, #exf-h1, #ex-cond, #ex-min, #ex-max", root).forEach(function (e) { e.addEventListener("change", filt); });
      App.$$("#ex-x, #ex-y, #ex-c, #exs-m0, #exs-m1, #exs-h0, #exs-h1", root).forEach(function (e) { e.addEventListener("change", sc); });
      one(); filt(); sc();
    },
  };
})(window.App);
