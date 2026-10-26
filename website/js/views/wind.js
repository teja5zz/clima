/* Wind: annual, Indian-season and time-of-day wind roses, custom rose, heatmaps. */
(function (App) {
  "use strict";
  const Ch = App.Ch, S = App.S;

  // IMD seasons
  const SEASONS = [
    { id: "w-s1", name: "Winter (Jan–Feb)", m0: 1, m1: 2 },
    { id: "w-s2", name: "Pre-monsoon / summer (Mar–May)", m0: 3, m1: 5 },
    { id: "w-s3", name: "South-west monsoon (Jun–Sep)", m0: 6, m1: 9 },
    { id: "w-s4", name: "Post-monsoon (Oct–Dec)", m0: 10, m1: 12 },
  ];
  const DAYPARTS = [
    { id: "w-d1", name: "Morning (06–11 h)", h0: 7, h1: 12 },
    { id: "w-d2", name: "Afternoon (12–17 h)", h0: 13, h1: 18 },
    { id: "w-d3", name: "Evening (18–23 h)", h0: 19, h1: 24 },
    { id: "w-d4", name: "Night (00–05 h)", h0: 1, h1: 6 },
  ];

  App.views.wind = {
    html: function () {
      return App.pageHead("Wind", "Prevailing directions and speeds — essential for orienting openings, courtyards and outdoor spaces.") +
        App.card("Annual wind rose", '<div class="rose-main">' + App.chartBox("w-annual", "rose-lg") + '<div id="w-annual-note" class="note"></div></div>') +
        App.card("Seasonal wind roses (IMD seasons)", '<div class="grid-4">' + SEASONS.map(function (s) { return '<div>' + App.chartBox(s.id, "rose") + '<p class="caption" id="' + s.id + '-c"></p></div>'; }).join("") + "</div>",
          { lead: "The monsoon often reverses the wind. Openings that catch the pre-monsoon and monsoon breeze matter most for cooling." }) +
        App.card("Time-of-day wind roses", '<div class="grid-4">' + DAYPARTS.map(function (s) { return '<div>' + App.chartBox(s.id, "rose") + '<p class="caption" id="' + s.id + '-c"></p></div>'; }).join("") + "</div>",
          { lead: "Sea and land breezes on the coast, and katabatic winds in the hills, change direction between day and night." }) +
        App.card("Custom wind rose", '<div class="controls">' + App.timeFilter("wc", { m0: 4, m1: 6, h0: 18, h1: 24 }) + "</div>" + App.chartBox("w-custom", "rose-lg") + '<p class="caption" id="w-custom-c"></p>') +
        App.card("", App.chartBox("w-speed")) + App.card("", App.chartBox("w-dir"));
    },
    mount: function (root) {
      const ds = App.state.ds;
      const a = Ch.windRose(ds, null, "All hours");
      Ch.render("w-annual", a, "wind_rose_annual");
      App.$("#w-annual-note", root).innerHTML = prevailing(ds, null) + " Calm hours (< 0.5 m/s): <strong>" + (100 * a.calm / a.total).toFixed(0) + " %</strong>.";
      SEASONS.forEach(function (s) {
        const mask = Ch.mask(ds, { m0: s.m0, m1: s.m1 });
        const f = Ch.windRose(ds, mask, s.name, { legend: false, height: 300 });
        Ch.render(s.id, f, "wind_rose_" + s.id);
        App.$("#" + s.id + "-c", root).innerHTML = prevailing(ds, mask);
      });
      DAYPARTS.forEach(function (s) {
        const mask = Ch.mask(ds, { h0: s.h0, h1: s.h1 });
        Ch.render(s.id, Ch.windRose(ds, mask, s.name, { legend: false, height: 300 }), "wind_rose_" + s.id);
        App.$("#" + s.id + "-c", root).innerHTML = prevailing(ds, mask);
      });
      const custom = function () {
        const f = App.readTime("wc");
        const mask = Ch.mask(ds, f);
        const r = Ch.windRose(ds, mask, S.MONTHS[f.m0 - 1] + "–" + S.MONTHS[f.m1 - 1] + ", " + f.h0 + "–" + f.h1 + " h");
        Ch.render("w-custom", r, "wind_rose_custom");
        App.$("#w-custom-c", root).innerHTML = r.total + " hours selected. " + prevailing(ds, mask);
      };
      App.$$("#wc-m0, #wc-m1, #wc-h0, #wc-h1", root).forEach(function (e) { e.addEventListener("change", custom); });
      custom();
      Ch.render("w-speed", Ch.heatmap(ds, "wind_speed", { title: "Wind speed — hourly heatmap" }), "wind_speed_heatmap");
      Ch.render("w-dir", Ch.heatmap(ds, "wind_dir", { title: "Wind direction — hourly heatmap (0° = from north)", range: [0, 360] }), "wind_direction_heatmap");
    },
  };

  const NAMES = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  function prevailing(ds, mask) {
    const c = new Array(16).fill(0), sp = new Array(16).fill(0);
    let n = 0;
    for (let i = 0; i < ds.n; i++) {
      if (mask && !mask[i]) continue;
      if (ds.d.wind_speed[i] < 0.5) continue;
      const k = Math.round(((ds.d.wind_dir[i] % 360) + 360) % 360 / 22.5) % 16;
      c[k]++; sp[k] += ds.d.wind_speed[i]; n++;
    }
    if (!n) return "Mostly calm.";
    const k = c.indexOf(Math.max.apply(null, c));
    return "Prevailing from <strong>" + NAMES[k] + "</strong> (" + (100 * c[k] / n).toFixed(0) + " % of windy hours, mean " +
      App.fmt(App.conv("wind_speed", sp[k] / c[k]), App.units === "ip" ? 0 : 1) + " " + App.unit("wind_speed") + ").";
  }
})(window.App);
