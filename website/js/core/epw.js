/* EnergyPlus Weather (EPW) reader and derived-metric pipeline. */
window.App = window.App || {};
(function (App) {
  "use strict";
  const S = App.S;

  // EPW column index, key, missing-value sentinel
  const COLS = [
    [6, "DBT", 99.9], [7, "DPT", 99.9], [8, "RH", 999], [9, "p_atm", 999999],
    [10, "extr_hor_rad", 9999], [12, "hor_ir_rad", 9999], [13, "glob_hor_rad", 9999],
    [14, "dir_nor_rad", 9999], [15, "dif_hor_rad", 9999], [16, "glob_hor_ill", 999999],
    [17, "dir_nor_ill", 999999], [18, "dif_hor_ill", 999999], [19, "Zlumi", 9999],
    [20, "wind_dir", 999], [21, "wind_speed", 999], [22, "tot_sky_cover", 99],
    [23, "Oskycover", 99], [24, "Vis", 9999], [33, "precip", 999],
  ];
  const N = 8760;

  function interpolate(arr) {
    let missing = 0;
    const n = arr.length;
    let first = -1;
    for (let i = 0; i < n; i++) if (isFinite(arr[i])) { first = i; break; }
    if (first < 0) return n;
    for (let i = 0; i < n; i++) {
      if (isFinite(arr[i])) continue;
      missing++;
      let a = i - 1; while (a >= 0 && !isFinite(arr[a])) a--;
      let b = i + 1; while (b < n && !isFinite(arr[b])) b++;
      if (a < 0) arr[i] = arr[b];
      else if (b >= n) arr[i] = arr[a];
      else arr[i] = arr[a] + (arr[b] - arr[a]) * (i - a) / (b - a);
    }
    return missing;
  }

  App.parseEpw = function (text, fileName) {
    const lines = text.split(/\r?\n/);
    if (!lines[0] || lines[0].indexOf("LOCATION") !== 0) {
      throw new Error("This does not look like an EPW file (first line must start with LOCATION).");
    }
    const loc = lines[0].split(",");
    const L = loc.length;
    const meta = {
      file: fileName || "weather.epw",
      city: (loc[1] || "").trim().replace(/_/g, " "),
      state: (loc[2] || "").trim(),
      country: (loc[3] || "").trim(),
      source: (loc[4] || "").trim(),
      wmo: (loc[5] || "").trim(),
      lat: parseFloat(loc[L - 4]),
      lon: parseFloat(loc[L - 3]),
      tz: parseFloat(loc[L - 2]),
      elevation: parseFloat(loc[L - 1]),
      period: null,
    };
    if (!isFinite(meta.lat) || !isFinite(meta.lon) || !isFinite(meta.tz)) {
      throw new Error("Could not read latitude / longitude / time zone from the EPW header.");
    }
    const m = /cord=['"]?([^'" ;]+);/.exec(lines[5] || "");
    if (m) meta.period = m[1];

    const rows = [];
    for (let i = 8; i < lines.length && rows.length < N; i++) {
      const l = lines[i].trim();
      if (!l) continue;
      const parts = l.split(",");
      if (parts.length < 22) continue;
      if (+parts[1] === 2 && +parts[2] === 29) continue; // drop leap day
      rows.push(parts);
    }
    if (rows.length < N) throw new Error("EPW file has " + rows.length + " hourly records; 8760 are required.");

    const d = {};
    COLS.forEach(function (c) { d[c[1]] = new Float64Array(N); });
    ["month", "day", "hour", "doy", "year"].forEach(function (k) { d[k] = new Float64Array(N); });
    const years = {};
    for (let i = 0; i < N; i++) {
      const r = rows[i];
      d.year[i] = +r[0]; years[+r[0]] = 1;
      d.month[i] = +r[1]; d.day[i] = +r[2]; d.hour[i] = +r[3];
      d.doy[i] = S.doyOf(d.month[i], d.day[i]);
      for (let k = 0; k < COLS.length; k++) {
        const c = COLS[k];
        const v = parseFloat(r[c[0]]);
        d[c[1]][i] = (!isFinite(v) || v >= c[2]) ? NaN : v;
      }
    }
    if (!meta.period) {
      const ys = Object.keys(years).map(Number);
      const lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys);
      meta.period = lo === hi ? String(lo) : lo + "–" + hi;
    }

    const warnings = [];
    ["DBT", "DPT", "RH", "wind_speed", "wind_dir", "p_atm"].forEach(function (k) {
      const miss = interpolate(d[k]);
      if (miss === N) {
        if (k === "p_atm") { d.p_atm.fill(101325 * Math.pow(1 - 2.25577e-5 * (meta.elevation || 0), 5.2559)); }
        else if (k === "wind_dir" || k === "wind_speed") { d[k].fill(0); warnings.push(App.vname(k) + " is missing from this file."); }
        else throw new Error(App.vname(k) + " is missing from the whole file.");
      } else if (miss > 0) {
        warnings.push(miss + " missing hourly values of " + App.vname(k) + " were interpolated.");
      }
    });
    ["glob_hor_rad", "dir_nor_rad", "dif_hor_rad", "extr_hor_rad"].forEach(function (k) {
      let miss = 0;
      for (let i = 0; i < N; i++) if (!isFinite(d[k][i])) { d[k][i] = 0; miss++; }
      if (miss) warnings.push(miss + " missing values of " + App.vname(k) + " were set to 0.");
    });

    const ds = { meta: meta, n: N, d: d, warnings: warnings };
    derive(ds);
    return ds;
  };

  function derive(ds) {
    const d = ds.d, meta = ds.meta;
    const k = ["elevation", "azimuth", "zenith", "eqt", "delta_mrt", "MRT", "utci_Sun_Wind", "utci_Sun_noWind",
      "utci_noSun_Wind", "utci_noSun_noWind", "utci_Sun_Wind_cat", "utci_Sun_noWind_cat", "utci_noSun_Wind_cat",
      "utci_noSun_noWind_cat", "hr", "t_wb", "h", "heat_index", "adaptive_cmf", "adaptive_80_low", "adaptive_80_up",
      "adaptive_90_low", "adaptive_90_up", "adaptive_rmt", "t30", "imac_nv", "imac_nv_low", "imac_nv_up", "imac_mm",
      "imac_mm_low", "imac_mm_up"];
    k.forEach(function (key) { d[key] = new Float64Array(N); });

    for (let i = 0; i < N; i++) {
      const sp = S.solarPosition(d.doy[i], d.hour[i] - 0.5, meta.lat, meta.lon, meta.tz);
      d.elevation[i] = sp.apparentElevation;
      d.azimuth[i] = sp.azimuth;
      d.zenith[i] = sp.zenith;
      d.eqt[i] = sp.equationOfTime;
      const alt = sp.elevation > 0 ? sp.elevation : 0;
      const dmrt = sp.elevation > 0 ? Math.min(70, S.solarDeltaMrt(alt, 45, d.dir_nor_rad[i])) : 0;
      d.delta_mrt[i] = dmrt;
      const t = d.DBT[i], rh = d.RH[i];
      d.MRT[i] = t + dmrt;
      let v = d.wind_speed[i];
      if (v >= 17) v = 16.9;
      if (v <= 0.5) v = 0.6;
      const v0 = 0.5;
      d.utci_Sun_Wind[i] = S.utci(t, d.MRT[i], v, rh);
      d.utci_Sun_noWind[i] = S.utci(t, d.MRT[i], v0, rh);
      d.utci_noSun_Wind[i] = S.utci(t, t, v, rh);
      d.utci_noSun_noWind[i] = S.utci(t, t, v0, rh);
      d.utci_Sun_Wind_cat[i] = S.utciCategory(d.utci_Sun_Wind[i]);
      d.utci_Sun_noWind_cat[i] = S.utciCategory(d.utci_Sun_noWind[i]);
      d.utci_noSun_Wind_cat[i] = S.utciCategory(d.utci_noSun_Wind[i]);
      d.utci_noSun_noWind_cat[i] = S.utciCategory(d.utci_noSun_noWind[i]);
      const hr = S.humidityRatio(t, rh, d.p_atm[i]);
      d.hr[i] = hr * 1000;
      d.t_wb[i] = S.wetBulb(t, rh);
      d.h[i] = S.enthalpy(t, hr) / 1000;
      d.heat_index[i] = S.heatIndex(t, rh);
    }

    // daily statistics
    const daily = { mean: new Float64Array(365), min: new Float64Array(365), max: new Float64Array(365),
      rhMean: new Float64Array(365) };
    for (let day = 0; day < 365; day++) {
      let s = 0, mn = Infinity, mx = -Infinity, sr = 0;
      for (let h = 0; h < 24; h++) {
        const v = d.DBT[day * 24 + h];
        s += v; sr += d.RH[day * 24 + h];
        if (v < mn) mn = v; if (v > mx) mx = v;
      }
      daily.mean[day] = s / 24; daily.min[day] = mn; daily.max[day] = mx; daily.rhMean[day] = sr / 24;
    }
    ds.daily = daily;

    for (let day = 0; day < 365; day++) {
      // ASHRAE 55: exponentially weighted running mean of the last 7 days (alpha 0.9)
      const last7 = [];
      for (let j = 1; j <= 7; j++) last7.push(daily.mean[(day - j + 365) % 365]);
      const rmt = S.runningMean(last7, 0.9);
      const a = S.adaptiveAshrae(rmt);
      // IMAC / NBC 2016: simple 30-day running mean of daily mean outdoor temperature
      let s30 = 0;
      for (let j = 1; j <= 30; j++) s30 += daily.mean[(day - j + 365) % 365];
      const t30 = s30 / 30;
      const nv = S.imac(t30, "nv"), mm = S.imac(t30, "mm");
      for (let h = 0; h < 24; h++) {
        const i = day * 24 + h;
        d.adaptive_rmt[i] = rmt; d.adaptive_cmf[i] = a.cmf;
        d.adaptive_80_low[i] = a.low80; d.adaptive_80_up[i] = a.up80;
        d.adaptive_90_low[i] = a.low90; d.adaptive_90_up[i] = a.up90;
        d.t30[i] = t30;
        d.imac_nv[i] = nv.cmf; d.imac_nv_low[i] = nv.low; d.imac_nv_up[i] = nv.up;
        d.imac_mm[i] = mm.cmf; d.imac_mm_low[i] = mm.low; d.imac_mm_up[i] = mm.up;
      }
    }

    // monthly statistics
    const monthly = [];
    for (let mo = 1; mo <= 12; mo++) {
      const dayMax = [], dayMin = [], rh = [], rhDay = [], ghi = [], dbt = [], ws = [];
      for (let day = 0; day < 365; day++) {
        if (d.month[day * 24] !== mo) continue;
        dayMax.push(daily.max[day]); dayMin.push(daily.min[day]); rh.push(daily.rhMean[day]);
        let g = 0;
        for (let h = 0; h < 24; h++) { g += d.glob_hor_rad[day * 24 + h]; dbt.push(d.DBT[day * 24 + h]); ws.push(d.wind_speed[day * 24 + h]); }
        // daytime humidity: hourly records ending 10:00–18:00 local time (09–18 h)
        for (let h = 9; h < 18; h++) rhDay.push(d.RH[day * 24 + h]);
        ghi.push(g);
      }
      monthly.push({
        month: mo, tMax: S.mean(dayMax), tMin: S.mean(dayMin), tMean: S.mean(dbt), rh: S.mean(rh), rhDay: S.mean(rhDay),
        ghiDaily: S.mean(ghi) / 1000, wind: S.mean(ws), absMax: S.max(dayMax), absMin: S.min(dayMin),
        precip: null,
      });
    }
    let hasPrecip = false;
    for (let i = 0; i < N; i++) if (isFinite(d.precip[i]) && d.precip[i] > 0) { hasPrecip = true; break; }
    if (hasPrecip) {
      monthly.forEach(function (mm) { mm.precip = 0; });
      for (let i = 0; i < N; i++) if (isFinite(d.precip[i])) monthly[d.month[i] - 1].precip += d.precip[i];
    }
    ds.monthly = monthly;
    ds.nbc = S.classifyNbc(monthly);
  }

  /* ---------------- loaders ---------------- */
  App.readEpwFromBuffer = async function (buf, name) {
    const bytes = new Uint8Array(buf);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) { // "PK" zip
      if (!window.JSZip) throw new Error("ZIP support failed to load.");
      const zip = await JSZip.loadAsync(buf);
      const entry = Object.keys(zip.files).find(function (f) { return /\.epw$/i.test(f); });
      if (!entry) throw new Error("The ZIP archive does not contain an .epw file.");
      const text = await zip.files[entry].async("string");
      return App.parseEpw(text, entry.split("/").pop());
    }
    return App.parseEpw(new TextDecoder("utf-8").decode(bytes), name);
  };

  // Weather repositories that do not send CORS headers: always go through the site proxy.
  const NO_CORS_HOSTS = ["climate.onebuilding.org", "energyplus-weather.s3.amazonaws.com", "energyplus.net", "www.energyplus.net"];

  // Names of the station files mirrored on this site (epw/index.json, built at deploy time
  // by tools/mirror_epw.py). Empty when the site has no mirror.
  let mirrorIndex = null;
  App.epwMirror = async function () {
    if (mirrorIndex) return mirrorIndex;
    const base = window.SITE && window.SITE.epwMirror;
    mirrorIndex = new Set();
    if (base) {
      try {
        const r = await fetch(base + "index.json", { cache: "no-cache" });
        if (r.ok) mirrorIndex = new Set(await r.json());
      } catch (e) { /* no mirror on this host */ }
    }
    return mirrorIndex;
  };

  App.readEpwFromUrl = async function (url) {
    const abs = new URL(url, location.href);
    const name = decodeURIComponent(abs.pathname.split("/").pop());
    const external = NO_CORS_HOSTS.indexOf(abs.hostname) >= 0;
    if (external && (await App.epwMirror()).has(name)) {
      const res = await fetch(window.SITE.epwMirror + encodeURIComponent(name));
      if (res.ok) {
        const ds = await App.readEpwFromBuffer(await res.arrayBuffer(), name);
        ds.meta.sourceUrl = abs.href; // share links keep the original source
        return ds;
      }
    }
    const proxy = (window.SITE && window.SITE.epwProxy) || "";
    const viaProxy = proxy && external;
    let res;
    try {
      res = await fetch(viaProxy ? proxy + "?url=" + encodeURIComponent(abs.href) : abs.href);
    } catch (e) {
      if (!viaProxy && proxy && abs.origin !== location.origin) {
        try { res = await fetch(proxy + "?url=" + encodeURIComponent(abs.href)); } catch (e2) { res = null; }
      }
      if (!res) {
        throw new Error("The browser could not download this file (the server blocks cross-site downloads). " +
          "Download it to your computer and drop it in the upload box instead.");
      }
    }
    if (!res.ok) {
      let msg = "Download failed (HTTP " + res.status + ").";
      try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) { /* not JSON */ }
      if (viaProxy && (res.status === 404 && !/weather file/i.test(msg))) {
        msg = "This weather file could not be fetched here. Use the ↓ link to download it, then drop it in the upload box.";
      }
      throw new Error(msg);
    }
    const buf = await res.arrayBuffer();
    const ds = await App.readEpwFromBuffer(buf, name);
    ds.meta.sourceUrl = abs.origin === location.origin ? null : abs.href;
    return ds;
  };

  /* ---------------- CSV export ---------------- */
  App.toCsv = function (ds) {
    const keys = ["month", "day", "hour", "DBT", "DPT", "RH", "p_atm", "glob_hor_rad", "dir_nor_rad", "dif_hor_rad",
      "glob_hor_ill", "wind_dir", "wind_speed", "tot_sky_cover", "elevation", "azimuth", "hr", "t_wb", "h",
      "heat_index", "MRT", "utci_Sun_Wind", "utci_Sun_noWind", "utci_noSun_Wind", "utci_noSun_noWind",
      "adaptive_cmf", "adaptive_80_low", "adaptive_80_up", "t30", "imac_nv", "imac_nv_low", "imac_nv_up",
      "imac_mm", "imac_mm_low", "imac_mm_up"];
    const head = keys.map(function (k) { return App.V[k] ? App.V[k].name + " [" + App.V[k].u.si + "]" : k; });
    const out = [head.join(",")];
    for (let i = 0; i < ds.n; i++) {
      out.push(keys.map(function (k) { const v = ds.d[k][i]; return Number.isInteger(v) ? v : (+v).toFixed(2); }).join(","));
    }
    return out.join("\n");
  };
})(window.App);
