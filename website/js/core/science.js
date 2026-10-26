/* Building-science engine: psychrometrics, solar geometry, thermal comfort
   (UTCI, ASHRAE 55 adaptive, IMAC / NBC 2016) and Indian climate classification.
   Algorithms follow pythermalcomfort v2.9.1, pvlib and the NOAA solar calculator. */
window.App = window.App || {};
(function (App) {
  "use strict";

  const S = {};
  const D2R = Math.PI / 180;
  const R2D = 180 / Math.PI;

  S.MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  S.MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  S.DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  S.doyOf = function (month, day) {
    let d = day;
    for (let m = 0; m < month - 1; m++) d += S.DAYS_IN_MONTH[m];
    return d;
  };

  S.dateFromDoy = function (doy) {
    let m = 0;
    while (m < 11 && doy > S.DAYS_IN_MONTH[m]) { doy -= S.DAYS_IN_MONTH[m]; m++; }
    return { month: m + 1, day: doy };
  };

  /* ---------------- Psychrometrics (pythermalcomfort) ---------------- */
  const C_TO_K = 273.15;
  S.pSat = function (tdb) {
    const tk = tdb + C_TO_K;
    if (tk < C_TO_K) {
      return Math.exp(-5674.5359 / tk + 6.3925247 +
        tk * (-0.9677843e-2 + tk * (0.62215701e-6 + tk * (0.20747825e-8 + -0.9484024e-12 * tk))) +
        4.1635019 * Math.log(tk));
    }
    return Math.exp(-5800.2206 / tk + 1.3914993 +
      tk * (-0.048640239 + tk * (0.41764768e-4 + tk * -0.14452093e-7)) + 6.5459673 * Math.log(tk));
  };

  S.dewPoint = function (tdb, rh) {
    const c = 257.14, b = 18.678, d = 234.5;
    const g = Math.log(Math.max(rh, 0.1) / 100 * Math.exp((b - tdb / d) * (tdb / (c + tdb))));
    return c * g / (b - g);
  };

  // Stull (2011) wet-bulb approximation, as used by pythermalcomfort
  S.wetBulb = function (tdb, rh) {
    return tdb * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) + Math.atan(tdb + rh) -
      Math.atan(rh - 1.676331) + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
  };

  S.humidityRatio = function (tdb, rh, pAtm) {
    const pv = rh / 100 * S.pSat(tdb);
    return 0.62198 * pv / ((pAtm || 101325) - pv);
  };

  S.rhFromHr = function (tdb, hr, pAtm) {
    const pv = hr * (pAtm || 101325) / (0.62198 + hr);
    return 100 * pv / S.pSat(tdb);
  };

  S.enthalpy = function (tdb, hr) {
    return 1004 * tdb + hr * (2501000 + 1805 * tdb);
  };

  /* ---------------- Solar position (NOAA) ---------------- */
  // doy: 1..365, localHour: decimal local standard time, tz: hours east of UTC
  S.solarPosition = function (doy, localHour, lat, lon, tz) {
    // Julian day for a non-leap reference year (2019)
    const jd0 = 2458484.5; // 2019-01-01 00:00 UTC
    const utcHours = localHour - tz;
    const jd = jd0 + (doy - 1) + utcHours / 24;
    const t = (jd - 2451545) / 36525;
    const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
    const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const c = Math.sin(m * D2R) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
      Math.sin(2 * m * D2R) * (0.019993 - 0.000101 * t) + Math.sin(3 * m * D2R) * 0.000289;
    const trueLong = l0 + c;
    const omega = 125.04 - 1934.136 * t;
    const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R);
    const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    const eps = eps0 + 0.00256 * Math.cos(omega * D2R);
    const decl = Math.asin(Math.sin(eps * D2R) * Math.sin(lambda * D2R)) * R2D;
    const y = Math.pow(Math.tan(eps * D2R / 2), 2);
    const eqTime = 4 * R2D * (y * Math.sin(2 * l0 * D2R) - 2 * e * Math.sin(m * D2R) +
      4 * e * y * Math.sin(m * D2R) * Math.cos(2 * l0 * D2R) -
      0.5 * y * y * Math.sin(4 * l0 * D2R) - 1.25 * e * e * Math.sin(2 * m * D2R)); // minutes
    const minutesUtc = utcHours * 60;
    let tst = (minutesUtc + eqTime + 4 * lon) % 1440;
    if (tst < 0) tst += 1440;
    let ha = tst / 4 - 180;
    const cosZen = Math.sin(lat * D2R) * Math.sin(decl * D2R) +
      Math.cos(lat * D2R) * Math.cos(decl * D2R) * Math.cos(ha * D2R);
    const zenith = Math.acos(Math.min(1, Math.max(-1, cosZen))) * R2D;
    const elevation = 90 - zenith;
    let az;
    const sz = Math.sin(zenith * D2R);
    if (Math.abs(sz) < 1e-9) {
      az = 180;
    } else {
      const cosAz = (Math.sin(lat * D2R) * Math.cos(zenith * D2R) - Math.sin(decl * D2R)) /
        (Math.cos(lat * D2R) * sz);
      const a = Math.acos(Math.min(1, Math.max(-1, cosAz))) * R2D;
      az = ha > 0 ? (a + 180) % 360 : (540 - a) % 360;
    }
    // atmospheric refraction (NOAA)
    let refr = 0;
    if (elevation <= 85) {
      const te = Math.tan(elevation * D2R);
      if (elevation > 5) refr = 58.1 / te - 0.07 / Math.pow(te, 3) + 0.000086 / Math.pow(te, 5);
      else if (elevation > -0.575) refr = 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)));
      else refr = -20.772 / te;
      refr /= 3600;
    }
    return {
      elevation: elevation,
      apparentElevation: elevation + refr,
      zenith: zenith,
      azimuth: az,
      declination: decl,
      equationOfTime: eqTime,
    };
  };

  /* ---------------- Solar gain on a person (ASHRAE 55 SolarCal) ---------------- */
  const FP_STANDING = [
    [0.35, 0.35, 0.314, 0.258, 0.206, 0.144, 0.082],
    [0.342, 0.342, 0.31, 0.252, 0.2, 0.14, 0.082],
    [0.33, 0.33, 0.3, 0.244, 0.19, 0.132, 0.082],
    [0.31, 0.31, 0.275, 0.228, 0.175, 0.124, 0.082],
    [0.283, 0.283, 0.251, 0.208, 0.16, 0.114, 0.082],
    [0.252, 0.252, 0.228, 0.188, 0.15, 0.108, 0.082],
    [0.23, 0.23, 0.214, 0.18, 0.148, 0.108, 0.082],
    [0.242, 0.242, 0.222, 0.18, 0.153, 0.112, 0.082],
    [0.274, 0.274, 0.245, 0.203, 0.165, 0.116, 0.082],
    [0.304, 0.304, 0.27, 0.22, 0.174, 0.121, 0.082],
    [0.328, 0.328, 0.29, 0.234, 0.183, 0.125, 0.082],
    [0.344, 0.344, 0.304, 0.244, 0.19, 0.128, 0.082],
    [0.347, 0.347, 0.308, 0.246, 0.191, 0.128, 0.082],
  ];
  const ALT_RANGE = [0, 15, 30, 45, 60, 75, 90];
  const AZ_RANGE = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180];

  function findSpan(arr, x) {
    for (let i = 0; i < arr.length - 1; i++) if (arr[i + 1] >= x && x >= arr[i]) return i;
    return -1;
  }

  // Returns the increase of mean radiant temperature [K] for a standing person.
  S.solarDeltaMrt = function (solAltitude, sharp, dni, opts) {
    const o = Object.assign({ transmittance: 1, fSvv: 1, fBes: 1, asw: 0.7, floorReflectance: 0.6 }, opts || {});
    const alt = Math.max(0, Math.min(90, solAltitude));
    const iDiff = 0.2 * dni;
    const ai = findSpan(ALT_RANGE, alt);
    const zi = findSpan(AZ_RANGE, sharp);
    const fp11 = FP_STANDING[zi][ai], fp12 = FP_STANDING[zi][ai + 1];
    const fp21 = FP_STANDING[zi + 1][ai], fp22 = FP_STANDING[zi + 1][ai + 1];
    const az1 = AZ_RANGE[zi], az2 = AZ_RANGE[zi + 1], al1 = ALT_RANGE[ai], al2 = ALT_RANGE[ai + 1];
    let fp = fp11 * (az2 - sharp) * (al2 - alt) + fp21 * (sharp - az1) * (al2 - alt) +
      fp12 * (az2 - sharp) * (alt - al1) + fp22 * (sharp - az1) * (alt - al1);
    fp /= (az2 - az1) * (al2 - al1);
    const fEff = 0.725;
    const eDiff = fEff * o.fSvv * 0.5 * o.transmittance * iDiff;
    const eDirect = fEff * fp * o.transmittance * o.fBes * dni;
    const eRefl = fEff * o.fSvv * 0.5 * o.transmittance * (dni * Math.sin(alt * D2R) + iDiff) * o.floorReflectance;
    const erf = (eDiff + eDirect + eRefl) * (o.asw / 0.95);
    return Math.round(erf / (6 * fEff) * 10) / 10;
  };

  /* ---------------- UTCI ---------------- */
  function utciVapourPressureHpa(tdb) {
    const g = [-2836.5744, -6028.076559, 19.54263612, -0.02737830188, 0.000016261698,
      7.0229056e-10, -1.8680009e-13];
    const tk = tdb + 273.15;
    let es = 2.7150305 * Math.log1p(tk);
    for (let i = 0; i < g.length; i++) es += g[i] * Math.pow(tk, i - 2);
    return Math.exp(es) * 0.01;
  }

  S.utci = function (tdb, tr, v, rh) {
    const pa = utciVapourPressureHpa(tdb) * (rh / 100) / 10;
    return Math.round(App.utciPoly(tdb, v, tr - tdb, pa) * 10) / 10;
  };

  S.UTCI_CATEGORIES = [
    { id: -5, max: -40, label: "Extreme cold stress", color: "#2B2977" },
    { id: -4, max: -27, label: "Very strong cold stress", color: "#38429B" },
    { id: -3, max: -13, label: "Strong cold stress", color: "#4253A4" },
    { id: -2, max: 0, label: "Moderate cold stress", color: "#4B62AD" },
    { id: -1, max: 9, label: "Slight cold stress", color: "#68B8E7" },
    { id: 0, max: 26, label: "No thermal stress", color: "#53B848" },
    { id: 1, max: 32, label: "Moderate heat stress", color: "#EE8522" },
    { id: 2, max: 38, label: "Strong heat stress", color: "#EA2C24" },
    { id: 3, max: 46, label: "Very strong heat stress", color: "#B12224" },
    { id: 4, max: Infinity, label: "Extreme heat stress", color: "#751613" },
  ];

  S.utciCategory = function (u) {
    if (!isFinite(u)) return NaN;
    for (const c of S.UTCI_CATEGORIES) if (u <= c.max) return c.id;
    return 4;
  };

  /* ---------------- Adaptive comfort ---------------- */
  // temps ordered newest (yesterday) first
  S.runningMean = function (temps, alpha) {
    let num = 0, den = 0, w = 1;
    for (let i = 0; i < temps.length; i++) { num += w * temps[i]; den += w; w *= alpha; }
    return Math.round(num / den * 10) / 10;
  };

  // ASHRAE 55 adaptive model (air speed 0.5 m/s, no cooling-effect extension)
  S.adaptiveAshrae = function (tRm) {
    const t = Math.round((0.31 * tRm + 17.8) * 10) / 10;
    return { cmf: t, low80: t - 3.5, up80: t + 3.5, low90: t - 2.5, up90: t + 2.5 };
  };

  // India Model for Adaptive Comfort (Manu et al. 2016), adopted by NBC 2016 Part 8
  S.IMAC = {
    nv: { slope: 0.54, intercept: 12.83, band90: 2.38, applicable: [12.5, 31.0], label: "Naturally ventilated" },
    mm: { slope: 0.28, intercept: 17.87, band90: 3.46, applicable: [13.0, 38.5], label: "Mixed-mode" },
  };
  S.imac = function (t30, mode) {
    const p = S.IMAC[mode || "nv"];
    const c = p.slope * t30 + p.intercept;
    return { cmf: c, low: c - p.band90, up: c + p.band90, inRange: t30 >= p.applicable[0] && t30 <= p.applicable[1] };
  };

  /* ---------------- Heat index (NOAA / Rothfusz), °C in & out ---------------- */
  S.heatIndex = function (tdb, rh) {
    const t = tdb * 1.8 + 32;
    let hi = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);
    if ((hi + t) / 2 >= 80) {
      hi = -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t -
        0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
      if (rh < 13 && t >= 80 && t <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
      else if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) / 10) * ((87 - t) / 5);
    }
    return (hi - 32) / 1.8;
  };

  S.HEAT_INDEX_LEVELS = [
    { max: 27, label: "No heat risk", color: "#53B848" },
    { max: 32, label: "Caution", color: "#f5d142" },
    { max: 41, label: "Extreme caution", color: "#EE8522" },
    { max: 54, label: "Danger", color: "#EA2C24" },
    { max: Infinity, label: "Extreme danger", color: "#751613" },
  ];

  /* ---------------- Indian climate zones (NBC 2016 / ECBC 2017) ---------------- */
  // Monthly classification on mean monthly maximum temperature and mean monthly relative humidity
  S.NBC_ZONES = {
    "hot-dry": { label: "Hot-Dry", color: "#e07a2f", rule: "Mean monthly max > 30 °C and mean RH < 55 %" },
    "warm-humid": { label: "Warm-Humid", color: "#1f8a9e", rule: "Mean monthly max > 30 °C and RH > 55 %, or > 25 °C and RH > 75 %" },
    "temperate": { label: "Temperate", color: "#5aa469", rule: "Mean monthly max 25–30 °C and mean RH < 75 %" },
    "cold": { label: "Cold", color: "#4a6fb5", rule: "Mean monthly max < 25 °C (any humidity)" },
    "composite": { label: "Composite", color: "#8a5aab", rule: "No single category holds for six months or more" },
  };

  S.classifyMonth = function (tMax, rh) {
    if (tMax > 30) return rh < 55 ? "hot-dry" : "warm-humid";
    if (tMax >= 25) return rh > 75 ? "warm-humid" : "temperate";
    return "cold";
  };

  S.classifyNbc = function (monthly) {
    const months = monthly.map(function (m) { return S.classifyMonth(m.tMax, m.rh); });
    const counts = {};
    months.forEach(function (z) { counts[z] = (counts[z] || 0) + 1; });
    let zone = "composite", best = 0;
    Object.keys(counts).forEach(function (z) { if (counts[z] >= 6 && counts[z] > best) { zone = z; best = counts[z]; } });
    return { zone: zone, months: months, counts: counts };
  };

  /* ---------------- Statistics helpers ---------------- */
  S.mean = function (a) {
    let s = 0, n = 0;
    for (let i = 0; i < a.length; i++) if (isFinite(a[i])) { s += a[i]; n++; }
    return n ? s / n : NaN;
  };
  S.min = function (a) { let m = Infinity; for (const v of a) if (isFinite(v) && v < m) m = v; return m; };
  S.max = function (a) { let m = -Infinity; for (const v of a) if (isFinite(v) && v > m) m = v; return m; };
  S.sum = function (a) { let s = 0; for (const v of a) if (isFinite(v)) s += v; return s; };
  S.quantile = function (a, q) {
    const s = Array.from(a).filter(isFinite).sort(function (x, y) { return x - y; });
    if (!s.length) return NaN;
    const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  };
  S.round = function (v, d) { const f = Math.pow(10, d || 0); return Math.round(v * f) / f; };

  App.S = S;
})(window.App);
