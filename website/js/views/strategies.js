/* Design strategy advisor: hour-by-hour test of passive strategies against IMAC comfort. */
(function (App) {
  "use strict";
  const Ch = App.Ch, S = App.S;
  const DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

  const STRATS = [
    { id: "comfort", name: "Comfortable without intervention", color: "#2f9e44",
      how: "Outdoor air already falls inside the IMAC naturally-ventilated band and is not too humid. Simple openable windows deliver comfort." },
    { id: "shade", name: "Solar shading of windows and walls", color: "#f08c00",
      how: "Hours that are warm and sunny. Use chajjas / overhangs on south, vertical fins or jaalis on east and west, verandahs, and light-coloured or cool roofs. See the <a href='#/shading'>shading designer</a>." },
    { id: "fans", name: "Air movement — cross-ventilation & ceiling fans", color: "#1c7ed6",
      how: "Up to ~3 °C above the comfort band, air speeds of 0.6–1.2 m/s restore comfort. Provide cross-ventilation, ceiling fans in every habitable room, and openings on the windward side." },
    { id: "evap", name: "Evaporative cooling", color: "#0ca678",
      how: "Hot hours with a low wet-bulb temperature. Desert coolers, two-stage evaporative coolers, water bodies and wetted khus / jute screens can deliver large savings. Not effective in humid months." },
    { id: "mass", name: "Thermal mass with night ventilation", color: "#ae3ec9",
      how: "Hot days followed by cool nights. Use heavy walls and roofs (stone, brick, rammed earth) with insulation outside, and open the building at night to flush heat (night purge)." },
    { id: "dehum", name: "Dehumidification", color: "#5c7cfa",
      how: "Moisture content above 12 g/kg. Use high air speed, desiccant or AC dehumidification modes; avoid cold surfaces where condensation can form." },
    { id: "solar", name: "Passive solar heating & insulation", color: "#e64980",
      how: "Cool hours. Insulate the roof and walls, let low winter sun in through south glazing, use sunspaces or Trombe walls in cold regions, and seal air leaks." },
    { id: "heat", name: "Active heating", color: "#862e9c",
      how: "Too cold for passive measures alone (more than 5 °C below the band). Size efficient heating — heat pumps, or solar-assisted systems in the Himalaya." },
    { id: "cool", name: "Mechanical cooling (AC) still needed", color: "#c92a42",
      how: "Hours that no passive strategy above can resolve. Use efficient (BEE 5-star, inverter) equipment, set-points from IMAC mixed-mode, and reduce loads first." },
  ];

  App.views.strategies = {
    html: function () {
      return App.pageHead("Design strategy advisor", "Which passive strategies work at this site, and for how many hours of the year — tested hour by hour against the IMAC comfort band.") +
        App.card("Strategy ranking", '<div id="st-list" class="strat-list"></div>', { lead: "Strategies can overlap — one hour can be fixed by shading and by fans. Percentages are of all 8,760 hours in the year." }) +
        App.card("", App.chartBox("st-month")) +
        '<div class="two-col">' + App.card("Orientation & openings", '<div id="st-orient"></div>') + App.card("Key climate indicators", '<div id="st-ind" class="stats"></div>') + "</div>" +
        App.card("Assumptions", '<ul class="tips small">' +
          "<li>Comfort band: IMAC naturally ventilated, 90 % acceptability (NBC 2016).</li>" +
          "<li>Shading: hour above the lower comfort limit with global horizontal radiation ≥ 300 W/m².</li>" +
          "<li>Air movement: temperature up to 3 °C above the band.</li>" +
          "<li>Evaporative cooling: above the band and wet-bulb temperature ≤ 22 °C.</li>" +
          "<li>Thermal mass + night flush: above the band, day maximum ≤ 38 °C and night minimum ≤ 24 °C.</li>" +
          "<li>Dehumidification: humidity ratio > 12 g/kg with temperature at or above the lower band limit.</li>" +
          "<li>Passive solar: up to 5 °C below the band; active heating beyond that.</li></ul>" +
          '<p class="muted small">This is a screening tool for early design. Confirm decisions with building energy simulation (e.g. EnergyPlus) using the same weather file.</p>');
    },
    mount: function (root) {
      const ds = App.state.ds, d = ds.d;
      const cnt = {}, monthly = {};
      STRATS.forEach(function (s) { cnt[s.id] = 0; monthly[s.id] = new Array(12).fill(0); });
      for (let i = 0; i < ds.n; i++) {
        const t = d.DBT[i], lo = d.imac_nv_low[i], up = d.imac_nv_up[i], w = d.hr[i], m = d.month[i] - 1;
        const day = Math.floor(i / 24);
        const hit = function (k) { cnt[k]++; monthly[k][m]++; };
        const humid = w > 12;
        if (t >= lo && t <= up && !humid) hit("comfort");
        if (t >= lo && d.glob_hor_rad[i] >= 300) hit("shade");
        if (humid && t >= lo) hit("dehum");
        if (t > up) {
          let solved = false;
          if (t <= up + 3) { hit("fans"); solved = true; }
          if (d.t_wb[i] <= 22) { hit("evap"); solved = true; }
          if (ds.daily.max[day] <= 38 && ds.daily.min[day] <= 24) { hit("mass"); solved = true; }
          if (!solved) hit("cool");
        } else if (t < lo) {
          if (t >= lo - 5) hit("solar"); else hit("heat");
        }
      }
      const order = STRATS.filter(function (s) { return cnt[s.id] > 0; }).sort(function (a, b) {
        if (a.id === "comfort") return -1; if (b.id === "comfort") return 1; return cnt[b.id] - cnt[a.id];
      });
      App.$("#st-list", root).innerHTML = order.map(function (s, k) {
        const p = 100 * cnt[s.id] / ds.n;
        return '<div class="strat"><div class="strat-rank" style="--c:' + s.color + '">' + (s.id === "comfort" ? "✓" : k) + '</div><div class="strat-body"><div class="strat-top"><h3>' + s.name +
          '</h3><span class="strat-pct">' + p.toFixed(0) + " %</span></div>" +
          '<div class="meter"><span style="width:' + p + "%;background:" + s.color + '"></span></div><p>' + s.how + "</p></div></div>";
      }).join("");
      Ch.render("st-month", { data: order.map(function (s) {
        return { type: "bar", x: S.MONTHS, y: monthly[s.id], name: s.name, marker: { color: s.color }, hovertemplate: "%{x}: %{y} h<extra>" + s.name + "</extra>" };
      }), layout: { barmode: "group", height: 380, title: { text: "Hours per month where each strategy applies", x: 0.01, font: { size: 14 } },
        yaxis: { title: "Hours", gridcolor: Ch.GRID }, legend: { orientation: "h", y: -0.2, font: { size: 10 } } } }, "strategies_monthly");
      orientation(ds, root);
      indicators(ds, root);
    },
  };

  function prevailing(ds, m0, m1) {
    const c = new Array(16).fill(0);
    const mask = Ch.mask(ds, { m0: m0, m1: m1 });
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i] || ds.d.wind_speed[i] < 0.5) continue;
      c[Math.round(((ds.d.wind_dir[i] % 360) + 360) % 360 / 22.5) % 16]++;
    }
    const k = c.indexOf(Math.max.apply(null, c));
    return S.max(c) > 0 ? DIRS[k] : "calm";
  }

  function orientation(ds, root) {
    const m = ds.meta, d = ds.d;
    // solar load on vertical façades (hot hours only)
    const faces = [["North", 0], ["East", 90], ["South", 180], ["West", 270]];
    const loads = faces.map(function (f) {
      let s = 0;
      for (let i = 0; i < ds.n; i++) {
        if (d.elevation[i] <= 0 || d.DBT[i] < d.imac_nv_low[i]) continue;
        const inc = Math.cos(d.elevation[i] * Math.PI / 180) * Math.cos((d.azimuth[i] - f[1]) * Math.PI / 180);
        if (inc > 0) s += d.dir_nor_rad[i] * inc;
      }
      return s / 1000;
    });
    const mx = S.max(loads);
    const hotWind = prevailing(ds, 3, 6), monsoon = prevailing(ds, 6, 9), winter = prevailing(ds, 11, 2);
    App.$("#st-orient", root).innerHTML =
      "<p>Direct-sun load on façades during warm hours (kWh/m² per year):</p>" +
      '<div class="face-bars">' + faces.map(function (f, k) {
        return '<div class="face"><span>' + f[0] + '</span><div class="meter"><span style="width:' + (100 * loads[k] / mx) + '%;background:#f08c00"></span></div><b>' + loads[k].toFixed(0) + "</b></div>";
      }).join("") + "</div>" +
      '<ul class="tips">' +
      "<li><strong>Elongate the plan east–west</strong> so the long façades face north and south; " + (loads[1] + loads[3] > loads[0] + loads[2] ? "east and west walls receive the most hot-hour sun here — minimise glazing on them." : "keep east/west glazing small and well shaded.") + "</li>" +
      "<li><strong>Summer (Mar–Jun) breeze:</strong> mostly from <strong>" + hotWind + "</strong>. <strong>Monsoon (Jun–Sep):</strong> from <strong>" + monsoon + "</strong>. Place inlet openings to face these, angled up to 45° off the wind if needed.</li>" +
      "<li><strong>Winter (Nov–Feb) wind:</strong> from <strong>" + winter + "</strong>" + (ds.nbc.zone === "cold" || ds.nbc.zone === "composite" ? " — shelter entrances and glazing from it." : ".") + "</li>" +
      (Math.abs(m.lat) < 23.44 ? "<li>The site is in the tropics: the summer sun goes north of overhead, so the <strong>north façade also needs shading</strong> in May–July mornings and evenings.</li>" : "") +
      "</ul>";
  }

  function indicators(ds, root) {
    const d = ds.d, dm = ds.daily;
    let range = 0; for (let k = 0; k < 365; k++) range += dm.max[k] - dm.min[k];
    const hotMonths = ds.monthly.filter(function (r) { return r.tMax > 32; }).map(function (r) { return S.MONTHS[r.month - 1]; });
    let wbHigh = 0; for (let i = 0; i < ds.n; i++) if (d.t_wb[i] >= 26) wbHigh++;
    App.$("#st-ind", root).innerHTML =
      App.stat("Mean daily temperature swing", App.fmt(App.tDelta(range / 365)) + " " + (App.units === "ip" ? "°F" : "K"), range / 365 >= 10 ? "large — thermal mass works well" : "small — mass offers limited benefit") +
      App.stat("Hot months (mean max > 32 °C)", hotMonths.length ? hotMonths.join(", ") : "none") +
      App.stat("Hours wet-bulb ≥ 26 °C", wbHigh, "muggy hours — evaporative cooling ineffective") +
      App.stat("Annual cooling degree days (18 °C)", App.fmt(Ch.degreeDays(ds, 18, 18).cdd, 0));
  }
})(window.App);
