/* Chart library built on Plotly.js. Each builder returns {data, layout}. */
window.App = window.App || {};
(function (App) {
  "use strict";
  const S = App.S;
  const Ch = {};

  const FONT = "Inter, 'Segoe UI', system-ui, -apple-system, sans-serif";
  const GRID = "#e7e2da";

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  Ch.dateOfDoy = function (doy) {
    const md = S.dateFromDoy(doy);
    return "2019-" + pad(md.month) + "-" + pad(md.day);
  };
  const DATES = [];
  for (let i = 1; i <= 365; i++) DATES.push(Ch.dateOfDoy(i));
  Ch.DATES = DATES;
  const HOUR_TICKS = { tickvals: [0, 3, 6, 9, 12, 15, 18, 21, 24], ticktext: ["0", "3", "6", "9", "12", "15", "18", "21", "24"] };

  Ch.baseLayout = function (extra) {
    return Object.assign({
      font: { family: FONT, size: 12, color: "#2b2b2b" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      margin: { l: 56, r: 24, t: 40, b: 44 },
      hoverlabel: { font: { family: FONT } },
      legend: { orientation: "h", y: -0.18, x: 0.5, xanchor: "center" },
      xaxis: { gridcolor: GRID, zeroline: false },
      yaxis: { gridcolor: GRID, zeroline: false },
    }, extra || {});
  };

  Ch.config = function (name) {
    const b = window.BRAND || {};
    const city = App.state && App.state.ds ? App.state.ds.meta.city.replace(/\W+/g, "_") : "";
    return {
      responsive: true,
      displaylogo: false,
      modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "toggleSpikelines", "hoverCompareCartesian"],
      toImageButtonOptions: { format: "png", scale: 2, filename: [b.company, city, name].filter(Boolean).join("_").replace(/\s+/g, "_") },
      topojsonURL: "vendor/topojson/",
    };
  };

  Ch.render = function (el, fig, name) {
    if (typeof el === "string") el = document.getElementById(el);
    if (!el) return;
    return Plotly.react(el, fig.data, Object.assign(Ch.baseLayout(), fig.layout), Ch.config(name || el.id));
  };

  /* ---------- filters ---------- */
  function inRange(v, a, b) { return a <= b ? v >= a && v <= b : v >= a || v <= b; }
  // f: {m0, m1, h0, h1, varKey, vMin, vMax} in display units
  Ch.mask = function (ds, f) {
    const d = ds.d, n = ds.n, out = new Uint8Array(n);
    f = f || {};
    const m0 = f.m0 || 1, m1 = f.m1 || 12, h0 = f.h0 || 1, h1 = f.h1 || 24;
    let fv = null, lo = -Infinity, hi = Infinity;
    if (f.varKey && d[f.varKey]) {
      fv = d[f.varKey];
      if (isFinite(f.vMin)) lo = App.toSi(f.varKey, f.vMin);
      if (isFinite(f.vMax)) hi = App.toSi(f.varKey, f.vMax);
    }
    for (let i = 0; i < n; i++) {
      out[i] = inRange(d.month[i], m0, m1) && inRange(d.hour[i], h0, h1) && (!fv || (fv[i] >= lo && fv[i] <= hi)) ? 1 : 0;
    }
    return out;
  };

  /* ---------- yearly band chart (daily min–max + mean) ---------- */
  // comfort: null | "ashrae" | "imac-nv" | "imac-mm"
  Ch.yearly = function (ds, key, comfort) {
    const arr = App.convArr(key, ds.d[key]);
    const mn = [], mx = [], me = [];
    for (let day = 0; day < 365; day++) {
      let a = Infinity, b = -Infinity, s = 0;
      for (let h = 0; h < 24; h++) { const v = arr[day * 24 + h]; if (v < a) a = v; if (v > b) b = v; s += v; }
      mn.push(a); mx.push(b); me.push(s / 24);
    }
    const col = App.V[key].colors[1] || "#444";
    const data = [];
    const daySeries = function (k) { const a = App.convArr(k, ds.d[k]); const o = []; for (let d = 0; d < 365; d++) o.push(a[d * 24]); return o; };
    if (comfort && /^(DBT|t_wb|MRT|utci)/.test(key)) {
      let lo, up, name, lo2, up2;
      if (comfort === "ashrae") {
        lo = daySeries("adaptive_80_low"); up = daySeries("adaptive_80_up");
        lo2 = daySeries("adaptive_90_low"); up2 = daySeries("adaptive_90_up");
        name = "ASHRAE 55 adaptive";
      } else {
        const m = comfort === "imac-mm" ? "imac_mm" : "imac_nv";
        lo = daySeries(m + "_low"); up = daySeries(m + "_up");
        name = "IMAC " + (m === "imac_mm" ? "mixed-mode" : "naturally ventilated") + " (NBC 2016)";
      }
      data.push({ x: DATES, y: lo, mode: "lines", line: { width: 0 }, hoverinfo: "skip", showlegend: false });
      data.push({ x: DATES, y: up, mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: "rgba(83,184,72,0.22)",
        name: name + (lo2 ? " 80 %" : " 90 %") + " acceptability", hovertemplate: "%{y:.1f}<extra>upper limit</extra>" });
      if (lo2) {
        data.push({ x: DATES, y: lo2, mode: "lines", line: { width: 0 }, hoverinfo: "skip", showlegend: false });
        data.push({ x: DATES, y: up2, mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: "rgba(83,184,72,0.35)",
          name: name + " 90 % acceptability", hovertemplate: "%{y:.1f}<extra>upper 90 %</extra>" });
      }
    }
    data.push({ x: DATES, y: mn, mode: "lines", line: { width: 0 }, hoverinfo: "skip", showlegend: false });
    data.push({ x: DATES, y: mx, mode: "lines", line: { width: 0 }, fill: "tonexty", fillcolor: hexA(col, 0.3),
      name: "Daily range", hovertemplate: "max %{y:.1f}<extra></extra>" });
    data.push({ x: DATES, y: me, mode: "lines", line: { color: col, width: 1.6 }, name: "Daily mean",
      hovertemplate: "%{x|%d %b}: %{y:.1f} " + App.unit(key) + "<extra>mean</extra>" });
    return {
      data: data,
      layout: { title: { text: App.vname(key) + " — annual profile", x: 0.01, font: { size: 15 } },
        xaxis: { gridcolor: GRID, tickformat: "%b", dtick: "M1" },
        yaxis: { gridcolor: GRID, title: App.unit(key) }, height: 420, hovermode: "x unified" },
    };
  };

  /* ---------- daily profiles, one panel per month ---------- */
  Ch.daily = function (ds, key) {
    const arr = App.convArr(key, ds.d[key]);
    const data = [], layout = { height: 360, showlegend: false, margin: { l: 50, r: 10, t: 50, b: 40 },
      title: { text: App.vname(key) + " — hourly values and monthly average day", x: 0.01, font: { size: 15 } } };
    const col = App.V[key].colors[1] || "#444";
    const r = [S.min(arr), S.max(arr)];
    const span = r[1] - r[0];
    for (let m = 1; m <= 12; m++) {
      const xs = [], ys = [], sums = new Array(24).fill(0), cnt = new Array(24).fill(0);
      for (let i = 0; i < ds.n; i++) if (ds.d.month[i] === m) {
        xs.push(ds.d.hour[i] - 0.5); ys.push(arr[i]);
        sums[ds.d.hour[i] - 1] += arr[i]; cnt[ds.d.hour[i] - 1]++;
      }
      const ax = m === 1 ? "" : m;
      data.push({ x: xs, y: ys, mode: "markers", type: "scattergl", xaxis: "x" + ax, yaxis: "y" + ax,
        marker: { size: 2.5, color: "rgba(120,120,120,0.35)" }, hoverinfo: "skip" });
      data.push({ x: sums.map(function (_, h) { return h + 0.5; }), y: sums.map(function (s, h) { return s / cnt[h]; }),
        mode: "lines", xaxis: "x" + ax, yaxis: "y" + ax, line: { color: col, width: 2.4 },
        hovertemplate: S.MONTHS[m - 1] + " %{x:.0f}h: %{y:.1f} " + App.unit(key) + "<extra></extra>" });
      const w = 1 / 12;
      layout["xaxis" + ax] = { domain: [(m - 1) * w + 0.004, m * w - 0.004], range: [0, 24], tickvals: [0, 12, 24], gridcolor: GRID,
        title: { text: S.MONTHS[m - 1], standoff: 2, font: { size: 11 } }, fixedrange: true };
      layout["yaxis" + ax] = { anchor: "x" + ax, range: [r[0] - span * 0.05, r[1] + span * 0.05], gridcolor: GRID,
        showticklabels: m === 1, matches: m === 1 ? undefined : "y", title: m === 1 ? App.unit(key) : undefined, fixedrange: true };
    }
    return { data: data, layout: layout };
  };

  /* ---------- heatmap (day of year × hour) ---------- */
  Ch.heatmap = function (ds, key, opts) {
    opts = opts || {};
    const arr = App.convArr(key, ds.d[key]);
    const mask = opts.mask;
    const z = [];
    for (let h = 0; h < 24; h++) {
      const row = [];
      for (let day = 0; day < 365; day++) {
        const i = day * 24 + h;
        row.push(!mask || mask[i] ? arr[i] : null);
      }
      z.push(row);
    }
    const range = opts.range || (opts.global ? App.range(key) : [S.min(arr), S.max(arr)]);
    return {
      data: [{ type: "heatmap", x: DATES, y: Array.from({ length: 24 }, function (_, h) { return h + 0.5; }), z: z,
        colorscale: opts.colorscale || App.colorscale(App.V[key].colors), zmin: range[0], zmax: range[1],
        colorbar: { title: { text: App.unit(key), side: "right" }, thickness: 14 },
        hovertemplate: "%{x|%d %b} %{y:.0f}h<br>%{z:.1f} " + App.unit(key) + "<extra></extra>" }],
      layout: { title: { text: opts.title || App.vname(key) + " — hourly heatmap", x: 0.01, font: { size: 15 } },
        xaxis: { tickformat: "%b", dtick: "M1", gridcolor: GRID },
        yaxis: Object.assign({ title: "Hour", range: [0, 24] }, HOUR_TICKS), height: opts.height || 380 },
    };
  };

  /* ---------- monthly box plots ---------- */
  Ch.monthlyBox = function (ds, key, title) {
    const arr = App.convArr(key, ds.d[key]);
    const col = App.V[key].colors[Math.min(2, App.V[key].colors.length - 1)];
    const x = [], y = [];
    for (let i = 0; i < ds.n; i++) {
      if (key === "glob_hor_rad" && arr[i] <= 0) continue; // daylight hours only
      x.push(S.MONTHS[ds.d.month[i] - 1]); y.push(arr[i]);
    }
    return {
      data: [{ type: "box", x: x, y: y, marker: { color: col, size: 2 }, line: { width: 1.2 }, boxpoints: false,
        name: App.vname(key), hovertemplate: "%{y:.1f}<extra></extra>" }],
      layout: { title: { text: title || App.vname(key), x: 0.01, font: { size: 14 } }, height: 300, showlegend: false,
        yaxis: { title: App.unit(key), gridcolor: GRID }, margin: { l: 56, r: 12, t: 40, b: 36 } },
    };
  };

  /* ---------- degree days ---------- */
  Ch.degreeDays = function (ds, hddBase, cddBase) {
    const hdd = new Array(12).fill(0), cdd = new Array(12).fill(0);
    for (let day = 0; day < 365; day++) {
      const t = ds.daily.mean[day], m = ds.d.month[day * 24] - 1;
      if (t < hddBase) hdd[m] += hddBase - t;
      if (t > cddBase) cdd[m] += t - cddBase;
    }
    const k = App.units === "ip" ? 1.8 : 1;
    return {
      hdd: S.sum(hdd) * k, cdd: S.sum(cdd) * k,
      data: [
        { type: "bar", x: S.MONTHS, y: hdd.map(function (v) { return v * k; }), name: "Heating degree days", marker: { color: "#4a6fb5" },
          hovertemplate: "%{y:.0f}<extra>HDD</extra>" },
        { type: "bar", x: S.MONTHS, y: cdd.map(function (v) { return v * k; }), name: "Cooling degree days", marker: { color: "#d9480f" },
          hovertemplate: "%{y:.0f}<extra>CDD</extra>" },
      ],
      layout: { barmode: "group", height: 340, title: { text: "Monthly heating and cooling degree days", x: 0.01, font: { size: 14 } },
        yaxis: { title: "Degree days (" + App.tUnit() + "·day)", gridcolor: GRID } },
    };
  };

  /* ---------- wind rose ---------- */
  const WIND_BINS_SI = [0.5, 1.5, 3.3, 5.5, 7.9, 10.7, 13.8, Infinity];
  const WIND_COLORS = ["#b2f2ff", "#33ddff", "#00aaff", "#0055ff", "#0000ff", "#aa00ff", "#ff00ff"];
  const DIRS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  Ch.windRose = function (ds, mask, title, opts) {
    opts = opts || {};
    const d = ds.d;
    const counts = WIND_BINS_SI.slice(0, -1).map(function () { return new Array(16).fill(0); });
    let total = 0, calm = 0;
    for (let i = 0; i < ds.n; i++) {
      if (mask && !mask[i]) continue;
      total++;
      const v = d.wind_speed[i];
      if (v < WIND_BINS_SI[0]) { calm++; continue; }
      const sector = Math.round(((d.wind_dir[i] % 360) + 360) % 360 / 22.5) % 16;
      for (let b = 0; b < WIND_BINS_SI.length - 1; b++) if (v < WIND_BINS_SI[b + 1]) { counts[b][sector]++; break; }
    }
    const uLabel = function (b) {
      const a = App.conv("wind_speed", WIND_BINS_SI[b]), c = WIND_BINS_SI[b + 1];
      return isFinite(c) ? a.toFixed(App.units === "ip" ? 0 : 1) + "–" + App.conv("wind_speed", c).toFixed(App.units === "ip" ? 0 : 1) + " " + App.unit("wind_speed")
        : "> " + a.toFixed(App.units === "ip" ? 0 : 1) + " " + App.unit("wind_speed");
    };
    const data = counts.map(function (row, b) {
      return { type: "barpolar", r: row.map(function (c) { return total ? 100 * c / total : 0; }), theta: DIRS, name: uLabel(b),
        marker: { color: WIND_COLORS[b], line: { color: "#fff", width: 0.4 } }, showlegend: opts.legend !== false,
        hovertemplate: "%{theta} " + uLabel(b) + ": %{r:.1f} % of hours<extra></extra>" };
    });
    return {
      total: total, calm: calm,
      data: data,
      layout: { title: { text: title || "Wind rose", x: 0.5, font: { size: 13 } }, height: opts.height || 420,
        margin: { l: 30, r: 30, t: 50, b: 30 }, legend: { orientation: "v", x: 1.02, y: 0.5, font: { size: 11 } },
        polar: { angularaxis: { direction: "clockwise", rotation: 90, gridcolor: GRID, tickfont: { size: 10 } },
          radialaxis: { ticksuffix: "%", gridcolor: GRID, tickfont: { size: 9 }, angle: 90, tickangle: 90 }, bgcolor: "rgba(0,0,0,0)" } },
    };
  };

  /* ---------- sun path (polar / stereographic-style) ---------- */
  Ch.sunPathPolar = function (ds, colorKey) {
    const S_ = S, meta = ds.meta, d = ds.d;
    const data = [];
    // analemmas, one per hour
    for (let h = 0; h < 24; h++) {
      const r = [], th = [];
      for (let doy = 1; doy <= 365; doy += 3) {
        const p = S_.solarPosition(doy, h, meta.lat, meta.lon, meta.tz);
        if (p.apparentElevation > 0) { r.push(90 - p.apparentElevation); th.push(p.azimuth); } else { r.push(null); th.push(null); }
      }
      if (r.some(function (v) { return v !== null; })) {
        data.push({ type: "scatterpolar", r: r, theta: th, mode: "lines", line: { color: "#b9b2a6", width: 1 }, hoverinfo: "skip", showlegend: false });
      }
    }
    // 21st of each month
    [[12, 21, "21 Dec"], [3, 21, "21 Mar / Sep"], [6, 21, "21 Jun"], [2, 21, ""], [4, 21, ""], [5, 21, ""], [1, 21, ""]].forEach(function (md) {
      const r = [], th = [];
      const doy = S_.doyOf(md[0], md[1]);
      for (let t = 0; t <= 24; t += 0.1) {
        const p = S_.solarPosition(doy, t, meta.lat, meta.lon, meta.tz);
        if (p.apparentElevation > 0) { r.push(90 - p.apparentElevation); th.push(p.azimuth); }
      }
      data.push({ type: "scatterpolar", r: r, theta: th, mode: "lines", name: md[2], showlegend: !!md[2],
        line: { color: md[2] ? "#7a6f63" : "#cfc8bd", width: md[2] ? 1.6 : 1, dash: md[2] ? "solid" : "dot" }, hoverinfo: "skip" });
    });
    // hourly data points coloured by variable
    const r = [], th = [], c = [], txt = [];
    const vals = colorKey && colorKey !== "none" ? App.convArr(colorKey, d[colorKey]) : null;
    for (let i = 0; i < ds.n; i++) {
      if (d.elevation[i] <= 0) continue;
      r.push(90 - d.elevation[i]); th.push(d.azimuth[i]);
      if (vals) c.push(vals[i]);
      txt.push(d.day[i] + " " + S_.MONTHS[d.month[i] - 1] + " " + d.hour[i] + "h");
    }
    if (vals) {
      data.push({ type: "scatterpolargl", r: r, theta: th, mode: "markers", text: txt, name: App.vname(colorKey), showlegend: false,
        marker: { size: 4, color: c, colorscale: App.colorscale(App.V[colorKey].colors), showscale: true,
          colorbar: { title: { text: App.unit(colorKey) }, thickness: 12, x: 1.08 } },
        hovertemplate: "%{text}<br>alt %{customdata:.0f}°, az %{theta:.0f}°<br>" + App.vname(colorKey) + ": %{marker.color:.1f} " + App.unit(colorKey) + "<extra></extra>",
        customdata: r.map(function (v) { return 90 - v; }) });
    }
    return {
      data: data,
      layout: { height: 560, title: { text: "Sun path — " + meta.city + " (lat " + meta.lat.toFixed(2) + "°)", x: 0.01, font: { size: 15 } },
        legend: { orientation: "h", y: -0.06 }, margin: { l: 40, r: 40, t: 60, b: 40 },
        polar: { bgcolor: "rgba(0,0,0,0)",
          radialaxis: { range: [0, 90], tickvals: [0, 15, 30, 45, 60, 75, 90], ticktext: ["90°", "75°", "60°", "45°", "30°", "15°", "0°"], gridcolor: GRID, angle: 90, tickfont: { size: 9 } },
          angularaxis: { direction: "clockwise", rotation: 90, tickvals: [0, 45, 90, 135, 180, 225, 270, 315], ticktext: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], gridcolor: GRID } } },
    };
  };

  Ch.sunPathCartesian = function (ds, colorKey) {
    const meta = ds.meta, d = ds.d, data = [];
    [[6, 21, "21 Jun"], [3, 21, "21 Mar / Sep"], [12, 21, "21 Dec"]].forEach(function (md) {
      const x = [], y = [];
      const doy = S.doyOf(md[0], md[1]);
      for (let t = 0; t <= 24; t += 0.1) {
        const p = S.solarPosition(doy, t, meta.lat, meta.lon, meta.tz);
        if (p.apparentElevation > 0) { x.push(p.azimuth); y.push(p.apparentElevation); }
      }
      data.push({ x: x, y: y, mode: "lines", name: md[2], line: { color: "#7a6f63", width: 1.4 }, hoverinfo: "skip" });
    });
    const x = [], y = [], c = [], txt = [];
    const vals = colorKey && colorKey !== "none" ? App.convArr(colorKey, d[colorKey]) : null;
    for (let i = 0; i < ds.n; i++) {
      if (d.elevation[i] <= 0) continue;
      x.push(d.azimuth[i]); y.push(d.elevation[i]); if (vals) c.push(vals[i]);
      txt.push(d.day[i] + " " + S.MONTHS[d.month[i] - 1] + " " + d.hour[i] + "h");
    }
    data.push({ type: "scattergl", x: x, y: y, mode: "markers", text: txt, showlegend: false,
      marker: vals ? { size: 4, color: c, colorscale: App.colorscale(App.V[colorKey].colors), showscale: true,
        colorbar: { title: { text: App.unit(colorKey) }, thickness: 12 } } : { size: 3, color: "#e8a33d" },
      hovertemplate: "%{text}<br>alt %{y:.0f}°, az %{x:.0f}°" + (vals ? "<br>%{marker.color:.1f} " + App.unit(colorKey) : "") + "<extra></extra>" });
    return { data: data, layout: { height: 460, title: { text: "Cartesian sun path", x: 0.01, font: { size: 15 } },
      xaxis: { title: "Azimuth (°)", range: [0, 360], tickvals: [0, 45, 90, 135, 180, 225, 270, 315, 360], ticktext: ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"], gridcolor: GRID },
      yaxis: { title: "Altitude (°)", range: [0, 90], gridcolor: GRID } } };
  };

  /* ---------- monthly average-day solar radiation ---------- */
  Ch.monthlySolar = function (ds) {
    const d = ds.d, data = [];
    const layout = { height: 340, margin: { l: 56, r: 10, t: 50, b: 40 }, legend: { orientation: "h", y: -0.2 },
      title: { text: "Average hourly solar radiation per month", x: 0.01, font: { size: 15 } } };
    const series = [["glob_hor_rad", "Global horizontal", "#e8590c"], ["dir_nor_rad", "Direct normal", "#f59f00"], ["dif_hor_rad", "Diffuse horizontal", "#4dabf7"]];
    let ymax = 0;
    for (let m = 1; m <= 12; m++) {
      const ax = m === 1 ? "" : m;
      series.forEach(function (s) {
        const sums = new Array(24).fill(0), cnt = new Array(24).fill(0);
        const arr = App.convArr(s[0], d[s[0]]);
        for (let i = 0; i < ds.n; i++) if (d.month[i] === m) { sums[d.hour[i] - 1] += arr[i]; cnt[d.hour[i] - 1]++; }
        const y = sums.map(function (v, h) { return v / cnt[h]; });
        ymax = Math.max(ymax, S.max(y));
        data.push({ x: y.map(function (_, h) { return h + 0.5; }), y: y, mode: "lines", name: s[1], showlegend: m === 1, legendgroup: s[0],
          line: { color: s[2], width: 1.8 }, xaxis: "x" + ax, yaxis: "y" + ax,
          hovertemplate: S.MONTHS[m - 1] + " %{x:.0f}h: %{y:.0f} " + App.unit(s[0]) + "<extra>" + s[1] + "</extra>" });
      });
      const w = 1 / 12;
      layout["xaxis" + ax] = { domain: [(m - 1) * w + 0.004, m * w - 0.004], range: [0, 24], tickvals: [6, 12, 18], gridcolor: GRID,
        title: { text: S.MONTHS[m - 1], standoff: 2, font: { size: 11 } }, fixedrange: true };
      layout["yaxis" + ax] = { anchor: "x" + ax, gridcolor: GRID, showticklabels: m === 1, matches: m === 1 ? undefined : "y",
        title: m === 1 ? App.unit("glob_hor_rad") : undefined, fixedrange: true };
    }
    layout.yaxis.range = [0, ymax * 1.05];
    return { data: data, layout: layout };
  };

  /* ---------- cloud cover ---------- */
  Ch.cloudCover = function (ds) {
    const clear = new Array(12).fill(0), partly = new Array(12).fill(0), over = new Array(12).fill(0), tot = new Array(12).fill(0);
    let valid = 0;
    for (let i = 0; i < ds.n; i++) {
      const c = ds.d.tot_sky_cover[i];
      if (!isFinite(c)) continue;
      valid++;
      const m = ds.d.month[i] - 1; tot[m]++;
      if (c <= 2) clear[m]++; else if (c <= 7) partly[m]++; else over[m]++;
    }
    const pct = function (a) { return a.map(function (v, m) { return tot[m] ? 100 * v / tot[m] : 0; }); };
    return {
      valid: valid,
      data: [
        { type: "bar", x: S.MONTHS, y: pct(clear), name: "Clear (0–2 tenths)", marker: { color: "#7ec9f3" }, hovertemplate: "%{y:.0f}%<extra>clear</extra>" },
        { type: "bar", x: S.MONTHS, y: pct(partly), name: "Partly cloudy (3–7)", marker: { color: "#cfd6db" }, hovertemplate: "%{y:.0f}%<extra>partly</extra>" },
        { type: "bar", x: S.MONTHS, y: pct(over), name: "Overcast (8–10)", marker: { color: "#8f979c" }, hovertemplate: "%{y:.0f}%<extra>overcast</extra>" },
      ],
      layout: { barmode: "stack", height: 320, title: { text: "Sky cover — share of hours", x: 0.01, font: { size: 14 } },
        yaxis: { ticksuffix: "%", range: [0, 100], gridcolor: GRID } },
    };
  };

  /* ---------- psychrometric chart ---------- */
  Ch.psychro = function (ds, mask, colorKey, opts) {
    opts = opts || {};
    const d = ds.d, data = [];
    const ip = App.units === "ip";
    const tx = function (t) { return ip ? t * 1.8 + 32 : t; };
    const wy = function (w) { return ip ? w * 7 : w; }; // g/kg -> gr/lb
    const tMin = -5, tMax = 50;
    const patm = S.mean(d.p_atm) || 101325;
    for (let rh = 10; rh <= 100; rh += 10) {
      const x = [], y = [];
      for (let t = tMin; t <= tMax; t += 0.5) { const w = S.humidityRatio(t, rh, patm) * 1000; if (w > 32) break; x.push(tx(t)); y.push(wy(w)); }
      data.push({ x: x, y: y, mode: "lines", line: { color: rh === 100 ? "#555" : "#cfc8bd", width: rh === 100 ? 1.6 : 0.8 },
        hoverinfo: "skip", showlegend: false });
      if (x.length) data.push({ x: [x[x.length - 1]], y: [y[y.length - 1]], mode: "text", text: [rh + "%"], textposition: "top left",
        textfont: { size: 9, color: "#8a8174" }, hoverinfo: "skip", showlegend: false });
    }
    // optional comfort polygon (summer, still air, approximate ASHRAE-55 style for 0.5 clo / 1.1 met)
    if (opts.zone) {
      const z = opts.zone; // {t0, t1, rhMax, wMax}
      const pts = [];
      for (let t = z.t0; t <= z.t1 + 1e-9; t += 0.25) pts.push([t, Math.min(z.wMax, S.humidityRatio(t, z.rhMax, patm) * 1000)]);
      const x = [tx(z.t0)].concat(pts.map(function (p) { return tx(p[0]); }), [tx(z.t1), tx(z.t0)]);
      const y = [0].concat(pts.map(function (p) { return wy(p[1]); }), [0, 0]);
      data.push({ x: x, y: y, mode: "lines", fill: "toself", fillcolor: "rgba(83,184,72,0.15)", line: { color: "#2f9e44", width: 1.5 },
        name: z.label, hoverinfo: "skip" });
    }
    const x = [], y = [], c = [], txt = [];
    const vals = colorKey && colorKey !== "none" ? App.convArr(colorKey, d[colorKey]) : null;
    let inZone = 0, count = 0;
    for (let i = 0; i < ds.n; i++) {
      if (mask && !mask[i]) continue;
      count++;
      x.push(tx(d.DBT[i])); y.push(wy(d.hr[i])); if (vals) c.push(vals[i]);
      txt.push(d.day[i] + " " + S.MONTHS[d.month[i] - 1] + " " + d.hour[i] + "h, RH " + d.RH[i].toFixed(0) + "%");
      if (opts.zone && d.DBT[i] >= opts.zone.t0 && d.DBT[i] <= opts.zone.t1 && d.RH[i] <= opts.zone.rhMax && d.hr[i] <= opts.zone.wMax) inZone++;
    }
    data.push({ type: "scattergl", x: x, y: y, mode: "markers", text: txt, name: "Hours", showlegend: false,
      marker: vals ? { size: 4, color: c, colorscale: App.colorscale(App.V[colorKey].colors), showscale: true, opacity: 0.8,
        colorbar: { title: { text: App.unit(colorKey) }, thickness: 12 } } : { size: 4, color: "rgba(194,65,12,0.45)" },
      hovertemplate: "%{text}<br>%{x:.1f} " + App.tUnit() + ", %{y:.1f} " + App.unit("hr") + "<extra></extra>" });
    return {
      inZone: inZone, count: count,
      data: data,
      layout: { height: 560, title: { text: "Psychrometric chart", x: 0.01, font: { size: 15 } },
        xaxis: { title: "Dry bulb temperature (" + App.tUnit() + ")", range: [tx(tMin), tx(tMax)], gridcolor: GRID },
        yaxis: { title: "Humidity ratio (" + App.unit("hr") + ")", range: [0, wy(30)], side: "right", gridcolor: GRID },
        legend: { orientation: "h", y: -0.15 } },
    };
  };

  /* ---------- binary heatmap + monthly bars for a condition ---------- */
  Ch.conditionHeatmap = function (ds, cond, title, colorOn) {
    const z = [];
    for (let h = 0; h < 24; h++) {
      const row = [];
      for (let day = 0; day < 365; day++) { const v = cond[day * 24 + h]; row.push(v === 2 ? null : v); }
      z.push(row);
    }
    return { data: [{ type: "heatmap", x: DATES, y: Array.from({ length: 24 }, function (_, h) { return h + 0.5; }), z: z, zmin: 0, zmax: 1,
      colorscale: [[0, "#efe9e1"], [1, colorOn || "#2f9e44"]], showscale: false,
      hovertemplate: "%{x|%d %b} %{y:.0f}h: %{z}<extra></extra>" }],
      layout: { title: { text: title, x: 0.01, font: { size: 15 } }, height: 340, xaxis: { tickformat: "%b", dtick: "M1" },
        yaxis: Object.assign({ title: "Hour", range: [0, 24] }, HOUR_TICKS) } };
  };

  Ch.monthlyShare = function (ds, cond, title, color, normalize) {
    const yes = new Array(12).fill(0), tot = new Array(12).fill(0);
    for (let i = 0; i < ds.n; i++) {
      if (cond[i] === 2) continue;
      const m = ds.d.month[i] - 1; tot[m]++; if (cond[i] === 1) yes[m]++;
    }
    const y = normalize ? yes.map(function (v, m) { return tot[m] ? 100 * v / tot[m] : 0; }) : yes;
    return { yes: S.sum(yes), total: S.sum(tot),
      data: [{ type: "bar", x: S.MONTHS, y: y, marker: { color: color || "#2f9e44" },
        hovertemplate: "%{x}: %{y:.0f}" + (normalize ? "% of selected hours" : " hours") + "<extra></extra>" }],
      layout: { title: { text: title, x: 0.01, font: { size: 14 } }, height: 300, showlegend: false,
        yaxis: { title: normalize ? "% of selected hours" : "Hours", ticksuffix: normalize ? "%" : "", gridcolor: GRID } } };
  };

  /* ---------- UTCI categories ---------- */
  Ch.utciCategoryHeatmap = function (ds, scenario, mask) {
    const cats = S.UTCI_CATEGORIES;
    const arr = ds.d[scenario + "_cat"];
    const z = [];
    for (let h = 0; h < 24; h++) {
      const row = [];
      for (let day = 0; day < 365; day++) { const i = day * 24 + h; row.push(!mask || mask[i] ? arr[i] : null); }
      z.push(row);
    }
    const cs = [];
    cats.forEach(function (c, k) { cs.push([k / cats.length, c.color]); cs.push([(k + 1) / cats.length, c.color]); });
    return { data: [{ type: "heatmap", x: DATES, y: Array.from({ length: 24 }, function (_, h) { return h + 0.5; }), z: z,
      zmin: -5.5, zmax: 4.5, colorscale: cs,
      colorbar: { tickvals: cats.map(function (c) { return c.id; }), ticktext: cats.map(function (c) { return c.label; }), thickness: 14, tickfont: { size: 10 } },
      customdata: z.map(function (row) { return row.map(function (v) { const c = cats.find(function (cc) { return cc.id === v; }); return c ? c.label : ""; }); }),
      hovertemplate: "%{x|%d %b} %{y:.0f}h<br>%{customdata}<extra></extra>" }],
      layout: { title: { text: "UTCI thermal stress categories", x: 0.01, font: { size: 15 } }, height: 380,
        xaxis: { tickformat: "%b", dtick: "M1" }, yaxis: Object.assign({ title: "Hour", range: [0, 24] }, HOUR_TICKS) } };
  };

  Ch.utciMonthly = function (ds, scenario, mask) {
    const cats = S.UTCI_CATEGORIES;
    const arr = ds.d[scenario + "_cat"];
    const tot = new Array(12).fill(0);
    const cnt = cats.map(function () { return new Array(12).fill(0); });
    for (let i = 0; i < ds.n; i++) {
      if (mask && !mask[i]) continue;
      const m = ds.d.month[i] - 1; tot[m]++;
      cnt[arr[i] + 5][m]++;
    }
    return { data: cats.map(function (c, k) {
      return { type: "bar", x: S.MONTHS, y: cnt[k].map(function (v, m) { return tot[m] ? 100 * v / tot[m] : 0; }), name: c.label,
        marker: { color: c.color }, hovertemplate: "%{x}: %{y:.0f}%<extra>" + c.label + "</extra>" };
    }).filter(function (t) { return t.y.some(function (v) { return v > 0; }); }),
    layout: { barmode: "stack", height: 360, title: { text: "Monthly share of hours by thermal stress", x: 0.01, font: { size: 14 } },
      yaxis: { ticksuffix: "%", range: [0, 100], gridcolor: GRID }, legend: { orientation: "h", y: -0.2, font: { size: 10 } } } };
  };

  /* ---------- generic scatter ---------- */
  Ch.scatter = function (ds, xk, yk, ck, mask) {
    const X = App.convArr(xk, ds.d[xk]), Y = App.convArr(yk, ds.d[yk]), C = ck && ck !== "none" ? App.convArr(ck, ds.d[ck]) : null;
    const x = [], y = [], c = [];
    for (let i = 0; i < ds.n; i++) { if (mask && !mask[i]) continue; x.push(X[i]); y.push(Y[i]); if (C) c.push(C[i]); }
    return { data: [{ type: "scattergl", x: x, y: y, mode: "markers",
      marker: C ? { size: 4, color: c, colorscale: App.colorscale(App.V[ck].colors), showscale: true, colorbar: { title: { text: App.unit(ck) }, thickness: 12 } }
        : { size: 4, color: "rgba(194,65,12,0.4)" },
      hovertemplate: App.vname(xk) + ": %{x:.1f}<br>" + App.vname(yk) + ": %{y:.1f}<extra></extra>" }],
      layout: { height: 460, title: { text: App.vname(yk) + " vs " + App.vname(xk), x: 0.01, font: { size: 15 } },
        xaxis: { title: App.vname(xk) + " (" + App.unit(xk) + ")", gridcolor: GRID }, yaxis: { title: App.vname(yk) + " (" + App.unit(yk) + ")", gridcolor: GRID } } };
  };

  /* ---------- Indian climate zone chart ---------- */
  Ch.nbcZones = function (ds) {
    const Z = S.NBC_ZONES, tx = function (t) { return App.units === "ip" ? t * 1.8 + 32 : t; };
    const rect = function (x0, x1, y0, y1, zone) {
      return { type: "rect", xref: "x", yref: "y", x0: x0, x1: x1, y0: tx(y0), y1: tx(y1), fillcolor: Z[zone].color, opacity: 0.13, line: { width: 0 }, layer: "below" };
    };
    const shapes = [rect(0, 55, 30, 50, "hot-dry"), rect(55, 100, 30, 50, "warm-humid"), rect(75, 100, 25, 30, "warm-humid"),
      rect(0, 75, 25, 30, "temperate"), rect(0, 100, -10, 25, "cold")];
    const ann = [[27, 40, "Hot-Dry"], [77, 40, "Warm-Humid"], [87, 27.5, "Warm-Humid"], [37, 27.5, "Temperate"], [50, 12, "Cold"]].map(function (a) {
      return { x: a[0], y: tx(a[1]), text: a[2], showarrow: false, font: { size: 12, color: "#6b6156" } };
    });
    const m = ds.monthly;
    const yAll = m.map(function (r) { return tx(r.tMax); });
    return { data: [{ x: m.map(function (r) { return r.rh; }), y: yAll, mode: "markers+text+lines", text: S.MONTHS,
      textposition: "top center", textfont: { size: 10 }, line: { color: "rgba(80,80,80,0.35)", width: 1, dash: "dot" },
      marker: { size: 11, color: ds.nbc.months.map(function (z) { return Z[z].color; }), line: { color: "#fff", width: 1.5 } },
      hovertemplate: "%{text}: max %{y:.1f}" + App.tUnit() + ", RH %{x:.0f}%<extra></extra>" }],
      layout: { height: 440, shapes: shapes, annotations: ann, showlegend: false,
        title: { text: "Monthly climate signature (NBC 2016 classification)", x: 0.01, font: { size: 15 } },
        xaxis: { title: "Mean monthly relative humidity (%)", range: [0, 100], gridcolor: GRID },
        yaxis: { title: "Mean monthly maximum temperature (" + App.tUnit() + ")", range: [tx(Math.min(0, S.min(m.map(function (r) { return r.tMax; })) - 3)), tx(Math.max(45, S.max(m.map(function (r) { return r.tMax; })) + 3))], gridcolor: GRID } } };
  };

  function hexA(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16), g = parseInt(h.substring(2, 4), 16), b = parseInt(h.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  Ch.hexA = hexA;
  Ch.GRID = GRID;
  Ch.HOUR_TICKS = HOUR_TICKS;

  App.Ch = Ch;
})(window.App);
