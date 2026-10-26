/* Temperature & humidity: annual band chart with comfort models, daily profiles, heatmap. */
(function (App) {
  "use strict";
  const S = App.S, Ch = App.Ch;
  let sel = { key: "DBT", comfort: "imac-nv", scale: "local" };

  App.views.temperature = {
    html: function () {
      return App.pageHead("Temperature & humidity", "How hot, cold, humid or dry the site is — through the year and through the day.") +
        '<div class="toolbar">' +
        '<div class="field"><label for="t-var">Variable</label><select id="t-var">' + App.varOptions(sel.key, ["DBT", "RH", "DPT", "t_wb", "hr", "heat_index"]) + "</select></div>" +
        '<div class="field"><label for="t-cmf">Comfort band (temperature only)</label><select id="t-cmf">' +
        '<option value="imac-nv">IMAC — naturally ventilated (NBC 2016)</option><option value="imac-mm">IMAC — mixed-mode (NBC 2016)</option>' +
        '<option value="ashrae">ASHRAE 55 adaptive</option><option value="none">None</option></select></div>' +
        '<div class="field"><label for="t-scale">Colour scale</label><select id="t-scale"><option value="local">Fit to this file</option><option value="global">Fixed (compare cities)</option></select></div>' +
        "</div>" +
        App.card("", App.chartBox("t-yearly") + '<div id="t-cmf-note" class="note"></div>') +
        App.card("", App.chartBox("t-daily")) +
        App.card("", App.chartBox("t-heat")) +
        App.card("Statistics", '<div id="t-table"></div>');
    },
    mount: function (root) {
      App.$("#t-cmf", root).value = sel.comfort;
      App.$("#t-scale", root).value = sel.scale;
      const draw = function () {
        sel = { key: App.$("#t-var", root).value, comfort: App.$("#t-cmf", root).value, scale: App.$("#t-scale", root).value };
        const ds = App.state.ds;
        Ch.render("t-yearly", Ch.yearly(ds, sel.key, sel.comfort === "none" ? null : sel.comfort), "annual_" + sel.key);
        Ch.render("t-daily", Ch.daily(ds, sel.key), "daily_" + sel.key);
        Ch.render("t-heat", Ch.heatmap(ds, sel.key, { global: sel.scale === "global" }), "heatmap_" + sel.key);
        App.$("#t-cmf-note", root).innerHTML = sel.key === "DBT" && sel.comfort !== "none" ? comfortNote(ds, sel.comfort) : "";
        App.$("#t-table", root).innerHTML = statsTable(ds, sel.key);
      };
      ["#t-var", "#t-cmf", "#t-scale"].forEach(function (s) { App.$(s, root).addEventListener("change", draw); });
      draw();
    },
  };

  function comfortNote(ds, model) {
    const d = ds.d;
    let lo, up, name;
    if (model === "ashrae") { lo = d.adaptive_80_low; up = d.adaptive_80_up; name = "the ASHRAE 55 adaptive 80 % band"; }
    else if (model === "imac-mm") { lo = d.imac_mm_low; up = d.imac_mm_up; name = "the IMAC mixed-mode 90 % band"; }
    else { lo = d.imac_nv_low; up = d.imac_nv_up; name = "the IMAC naturally-ventilated 90 % band"; }
    let inb = 0, above = 0, below = 0;
    for (let i = 0; i < ds.n; i++) { if (d.DBT[i] > up[i]) above++; else if (d.DBT[i] < lo[i]) below++; else inb++; }
    const p = function (v) { return (100 * v / ds.n).toFixed(0) + " %"; };
    return "Outdoor air is within " + name + " for <strong>" + p(inb) + "</strong> of the year, above it for <strong>" + p(above) +
      "</strong> and below it for <strong>" + p(below) + "</strong>. Indoors, good shading, thermal mass and ventilation can extend the comfortable share — see the <a href='#/strategies'>strategy advisor</a>.";
  }

  function statsTable(ds, key) {
    const arr = App.convArr(key, ds.d[key]), u = App.unit(key);
    let h = '<div class="table-wrap"><table class="num"><thead><tr><th></th><th>Annual</th>' + S.MONTHS.map(function (m) { return "<th>" + m + "</th>"; }).join("") + "</tr></thead><tbody>";
    const rows = [["Mean", S.mean], ["Min", S.min], ["5th pct", function (a) { return S.quantile(a, 0.05); }], ["Median", function (a) { return S.quantile(a, 0.5); }],
      ["95th pct", function (a) { return S.quantile(a, 0.95); }], ["Max", S.max]];
    const byMonth = [];
    for (let m = 1; m <= 12; m++) { const a = []; for (let i = 0; i < ds.n; i++) if (ds.d.month[i] === m) a.push(arr[i]); byMonth.push(a); }
    rows.forEach(function (r) {
      h += "<tr><th>" + r[0] + "</th><td><strong>" + App.fmt(r[1](arr)) + "</strong></td>" + byMonth.map(function (a) { return "<td>" + App.fmt(r[1](a)) + "</td>"; }).join("") + "</tr>";
    });
    return h + '</tbody></table></div><p class="muted small">Values in ' + u + ".</p>";
  }
})(window.App);
