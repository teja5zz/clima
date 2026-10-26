/* Direction-by-direction climate metrics for siting rooms, and room-specific science
   scores used by the Vastu × Science planner. Directions follow the Vastu zones:
   N, NE, E, SE, S, SW, W, NW (azimuth 0..315°, clockwise from true north). */
window.App = window.App || {};
(function (App) {
  "use strict";
  const S = App.S;
  const D2R = Math.PI / 180;
  const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  App.DIRS8 = DIRS;

  function minmax(a) {
    const lo = Math.min.apply(null, a), hi = Math.max.apply(null, a);
    return a.map(function (v) { return hi - lo < 1e-9 ? 0.5 : (v - lo) / (hi - lo); });
  }

  // Raw and normalised metrics for the 8 façade directions.
  App.siteMetrics = function (ds) {
    if (ds._siting) return ds._siting;
    const d = ds.d, n = ds.n;
    const raw = { hotSun: [], pmHotSun: [], coldSun: [], amSun: [], diffuseShare: [], breeze: [], nightBreeze: [], roofSolar: [] };
    let hot = 0, cold = 0;
    for (let i = 0; i < n; i++) { if (d.DBT[i] > d.imac_nv_up[i]) hot++; else if (d.DBT[i] < d.imac_nv_low[i]) cold++; }
    const tilt = Math.min(45, Math.abs(ds.meta.lat));
    DIRS.forEach(function (_, k) {
      const az = k * 45;
      let hs = 0, phs = 0, cs = 0, am = 0, dif = 0, tot = 0, br = 0, brN = 0, nb = 0, nbN = 0, roof = 0;
      for (let i = 0; i < n; i++) {
        const t = d.DBT[i], h = d.hour[i];
        const el = d.elevation[i];
        if (el > 0) {
          const cosInc = Math.cos(el * D2R) * Math.cos((d.azimuth[i] - az) * D2R);
          const beam = cosInc > 0 ? d.dir_nor_rad[i] * cosInc : 0;
          const diffuse = 0.5 * d.dif_hor_rad[i]; // vertical surface sees half the sky
          const g = (beam + diffuse) / 1000;      // kWh/m²
          if (t > d.imac_nv_up[i]) { hs += g; if (h >= 13 && h <= 19) phs += g; }
          if (t < d.imac_nv_low[i]) cs += g;
          if (h >= 7 && h <= 10) am += beam / 1000;
          dif += diffuse; tot += beam + diffuse;
          // tilted roof panel facing this direction
          const cz = Math.cos((90 - el) * D2R);
          const cosT = cz * Math.cos(tilt * D2R) + Math.sin((90 - el) * D2R) * Math.sin(tilt * D2R) * Math.cos((d.azimuth[i] - az) * D2R);
          roof += (Math.max(0, cosT) * d.dir_nor_rad[i] + d.dif_hor_rad[i] * (1 + Math.cos(tilt * D2R)) / 2) / 1000;
        }
        // wind arriving from this sector (±22.5°) while it is warm enough to want ventilation
        if (t >= d.imac_nv_low[i]) {
          const v = d.wind_speed[i];
          const from = ((d.wind_dir[i] - az) % 360 + 540) % 360 - 180;
          const inSector = v >= 1 && Math.abs(from) <= 22.5;
          br += inSector ? 1 : 0; brN++;
          if (h >= 19 || h <= 6) { nb += inSector ? 1 : 0; nbN++; }
        }
      }
      raw.hotSun.push(hs); raw.pmHotSun.push(phs); raw.coldSun.push(cs); raw.amSun.push(am);
      raw.diffuseShare.push(tot ? dif / tot : 0); raw.breeze.push(brN ? br / brN : 0); raw.nightBreeze.push(nbN ? nb / nbN : 0);
      raw.roofSolar.push(roof);
    });
    const norm = {};
    Object.keys(raw).forEach(function (k) { norm[k] = minmax(raw[k]); });
    // leeward side = opposite of where the breeze comes from
    norm.leeward = norm.breeze.map(function (_, k) { return norm.breeze[(k + 4) % 8]; });
    // heating vs cooling need from degree-days (HDD base 18 °C, CDD base 24 °C)
    let hdd = 0, cdd = 0;
    for (let k = 0; k < 365; k++) { const t = ds.daily.mean[k]; if (t < 18) hdd += 18 - t; if (t > 24) cdd += t - 24; }
    const heatShare = hdd / Math.max(1, hdd + cdd);
    ds._siting = { raw: raw, norm: norm, hotHours: hot, coldHours: cold, hdd: hdd, cdd: cdd, heatShare: heatShare };
    return ds._siting;
  };

  // Each profile: weighted terms [metricKey, weight, invert?, label shown when it helps, label when it hurts]
  const PROFILES = {
    bedroom: function (m) {
      const w = m.heatShare;
      return [["pmHotSun", 0.4 * (1 - w), true, "little afternoon heat on the walls", "strong afternoon sun heats walls before bedtime"],
        ["nightBreeze", 0.3, false, "catches the night breeze", "little night breeze"],
        ["hotSun", 0.3 * (1 - w), true, "low overheating-hour sun", "high overheating-hour sun"],
        ["coldSun", 0.7 * w, false, "warm winter sun", "little winter sun"]];
    },
    living: function (m) {
      const w = m.heatShare;
      return [["breeze", 0.35, false, "faces the prevailing breeze", "sheltered from the breeze"],
        ["hotSun", 0.35 * (1 - w), true, "low solar heat in hot hours", "high solar heat in hot hours"],
        ["coldSun", 0.35 * w, false, "useful winter sun", "little winter sun"],
        ["diffuseShare", 0.3, false, "soft, even daylight", "harsh direct sun / glare"]];
    },
    kitchen: function () {
      return [["amSun", 0.35, false, "bright morning sun (dries and disinfects)", "little morning sun"],
        ["pmHotSun", 0.35, true, "avoids afternoon heat while cooking", "afternoon sun adds to cooking heat"],
        ["leeward", 0.3, false, "downwind side — smoke and smells leave the house", "upwind — smells blow into the house"]];
    },
    pooja: function () {
      return [["amSun", 0.6, false, "receives early-morning sun", "little morning sun"],
        ["pmHotSun", 0.4, true, "calm and cool in the afternoon", "hot in the afternoon"]];
    },
    study: function () {
      return [["diffuseShare", 0.5, false, "steady, glare-free daylight", "glare from direct sun"],
        ["hotSun", 0.3, true, "stays cool", "overheats in hot hours"],
        ["breeze", 0.2, false, "ventilated", "little breeze"]];
    },
    dining: function () {
      return [["amSun", 0.4, false, "pleasant morning light for breakfast", "little morning light"],
        ["pmHotSun", 0.4, true, "cool for evening meals", "hot for evening meals"],
        ["breeze", 0.2, false, "ventilated", "little breeze"]];
    },
    entrance: function () {
      return [["breeze", 0.5, false, "an open door admits the prevailing breeze", "door faces away from the breeze"],
        ["pmHotSun", 0.5, true, "shaded approach in the afternoon", "harsh afternoon sun at the door"]];
    },
    buffer: function () {
      return [["hotSun", 0.6, false, "acts as a thermal buffer on the hottest side", "wastes a cool side on a service room"],
        ["breeze", 0.4, true, "keeps the breezy side free for living rooms", "blocks the prevailing breeze"]];
    },
    open: function () {
      return [["breeze", 0.7, false, "lets the breeze reach the house", "breeze-shadow side"],
        ["amSun", 0.3, false, "morning sun for plants", "little morning sun"]];
    },
    roofshade: function () {
      return [["pmHotSun", 1, false, "shades the roof and walls from the afternoon sun", "little shading benefit"]];
    },
    solar: function () {
      return [["roofSolar", 1, false, "highest yearly solar yield", "lower solar yield"]];
    },
  };

  // Returns {score: [8], why: [8]} in 0..1, or null when the climate has no bearing.
  App.scienceScores = function (metrics, profile) {
    if (!profile || !PROFILES[profile]) return null;
    const terms = PROFILES[profile](metrics).filter(function (t) { return t[1] > 0.001; });
    const wsum = terms.reduce(function (s, t) { return s + t[1]; }, 0);
    const score = [], why = [];
    for (let k = 0; k < 8; k++) {
      let s = 0;
      const parts = terms.map(function (t) {
        const v = metrics.norm[t[0]][k];
        const g = t[2] ? 1 - v : v;
        s += t[1] * g;
        return { g: g, w: t[1], good: t[3], bad: t[4] };
      });
      score.push(s / wsum);
      parts.sort(function (a, b) { return b.w * Math.abs(b.g - 0.5) - a.w * Math.abs(a.g - 0.5); });
      why.push(parts.slice(0, 2).map(function (p) { return p.g >= 0.5 ? p.good : p.bad; }).join("; "));
    }
    return { score: score, why: why };
  };

  // Greedy assignment of rooms to zones (at least 2 places per zone, more when needed; centre kept open).
  App.assignRooms = function (rooms, scoreFn) {
    const pairs = [];
    rooms.forEach(function (r) { DIRS.forEach(function (z, k) { pairs.push({ r: r, z: z, k: k, s: scoreFn(r, k) }); }); });
    pairs.sort(function (a, b) { return b.s - a.s; });
    const limit = Math.max(2, Math.ceil(rooms.length / DIRS.length));
    const used = {}, cap = {}, out = {};
    pairs.forEach(function (p) {
      if (used[p.r.id] || (cap[p.z] || 0) >= limit) return;
      used[p.r.id] = true; cap[p.z] = (cap[p.z] || 0) + 1;
      (out[p.z] = out[p.z] || []).push({ room: p.r, score: p.s });
    });
    return out;
  };
})(window.App);
