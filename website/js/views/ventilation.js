/* Natural ventilation potential: hours when opening windows can provide comfort. */
(function (App) {
  "use strict";
  const Ch = App.Ch;
  let sel = { mode: "imac", t0: 20, t1: 30, dpOn: true, dp: 20, norm: true };

  App.views.ventilation = {
    html: function () {
      const t = App.tUnit();
      return App.pageHead("Natural ventilation", "When is outdoor air suitable to bring inside? Use it to size openable areas and plan mixed-mode operation.") +
        '<div class="toolbar">' +
        '<div class="field"><label for="nv-mode">Acceptable outdoor temperature</label><select id="nv-mode">' +
        '<option value="imac">IMAC adaptive band, naturally ventilated (NBC 2016)</option><option value="fixed">Fixed range</option></select></div>' +
        '<div class="field nv-fixed"><label for="nv-t0">Min (' + t + ')</label><input id="nv-t0" type="number" step="0.5" value="' + App.fmt(App.conv("DBT", sel.t0)) + '"></div>' +
        '<div class="field nv-fixed"><label for="nv-t1">Max (' + t + ')</label><input id="nv-t1" type="number" step="0.5" value="' + App.fmt(App.conv("DBT", sel.t1)) + '"></div>' +
        '<div class="field"><label class="check"><input id="nv-dpon" type="checkbox"' + (sel.dpOn ? " checked" : "") + "> Limit dew point (avoid muggy air)</label>" +
        '<div class="pair"><input id="nv-dp" type="number" step="0.5" value="' + App.fmt(App.conv("DBT", sel.dp)) + '" aria-label="Maximum dew point"><span>' + t + " max</span></div></div>" +
        "</div>" +
        '<div class="toolbar">' + App.timeFilter("nv") +
        '<div class="field"><label class="check"><input id="nv-norm" type="checkbox"' + (sel.norm ? " checked" : "") + "> Show monthly bars as % of selected hours</label></div></div>" +
        App.card("", '<div id="nv-stats" class="stats"></div>' + App.chartBox("nv-heat") + App.chartBox("nv-bar")) +
        App.card("Designing for natural ventilation in India", '<ul class="tips">' +
          "<li><strong>Openable area:</strong> Eco-Niwas Samhita sets a minimum openable window-to-floor-area ratio by climate — 16.66 % in warm-humid, 12.5 % in composite and temperate, 10 % in hot-dry and 8.33 % in cold zones. Check it in the <a href='#/envelope'>envelope tool</a>.</li>" +
          "<li><strong>Cross-ventilation:</strong> place inlets facing the prevailing breeze for the selected season (see <a href='#/wind'>Wind</a>) and outlets on the leeward side, ideally larger than inlets.</li>" +
          "<li><strong>Stack ventilation:</strong> courtyards, stairwells and roof vents (ventilators, wind towers) drive airflow when wind is calm.</li>" +
          "<li><strong>Ceiling fans</strong> extend the acceptable range by about 2 °C or more at 0.6–1.2 m/s air speed — mixed-mode buildings can use the wider IMAC mixed-mode band.</li>" +
          "<li><strong>Dew point:</strong> in humid coastal months, a high dew point means ventilation alone will feel sticky; combine with fans and dehumidification.</li></ul>");
    },
    mount: function (root) {
      const ds = App.state.ds;
      App.$("#nv-mode", root).value = sel.mode;
      const draw = function () {
        sel.mode = App.$("#nv-mode", root).value;
        sel.t0 = App.toSi("DBT", +App.$("#nv-t0", root).value); sel.t1 = App.toSi("DBT", +App.$("#nv-t1", root).value);
        sel.dpOn = App.$("#nv-dpon", root).checked; sel.dp = App.toSi("DBT", +App.$("#nv-dp", root).value);
        sel.norm = App.$("#nv-norm", root).checked;
        App.$$(".nv-fixed", root).forEach(function (e) { e.hidden = sel.mode !== "fixed"; });
        App.$("#nv-dp", root).disabled = !sel.dpOn;
        const tm = Ch.mask(ds, App.readTime("nv"));
        const d = ds.d, cond = new Uint8Array(ds.n);
        let ok = 0, sel_ = 0, tooHot = 0, tooCold = 0, tooHumid = 0;
        for (let i = 0; i < ds.n; i++) {
          if (!tm[i]) { cond[i] = 2; continue; }
          sel_++;
          const lo = sel.mode === "imac" ? d.imac_nv_low[i] : sel.t0, up = sel.mode === "imac" ? d.imac_nv_up[i] : sel.t1;
          const t = d.DBT[i];
          if (t > up) { tooHot++; continue; }
          if (t < lo) { tooCold++; continue; }
          if (sel.dpOn && d.DPT[i] > sel.dp) { tooHumid++; continue; }
          cond[i] = 1; ok++;
        }
        const p = function (v) { return sel_ ? (100 * v / sel_).toFixed(0) + " %" : "–"; };
        App.$("#nv-stats", root).innerHTML = App.stat("Suitable for natural ventilation", p(ok), ok + " of " + sel_ + " hours", "good") +
          App.stat("Too hot outside", p(tooHot), "needs shading, mass, fans or cooling") + App.stat("Too cold outside", p(tooCold), "close windows, use solar gain") +
          (sel.dpOn ? App.stat("Too humid (dew point)", p(tooHumid), "fans or dehumidification") : "");
        Ch.render("nv-heat", Ch.conditionHeatmap(ds, cond, "Hours suitable for natural ventilation (green)"), "natural_ventilation_heatmap");
        Ch.render("nv-bar", Ch.monthlyShare(ds, cond, "Natural ventilation hours per month", "#2f9e44", sel.norm), "natural_ventilation_monthly");
      };
      App.$$("#main select, #main input").forEach(function (e) { e.addEventListener("change", draw); });
      draw();
    },
  };
})(window.App);
