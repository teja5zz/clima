/* Variable catalogue: display names, units (SI / IP), colour scales and ranges. */
window.App = window.App || {};
(function (App) {
  "use strict";

  const C = {
    temp: ["#00b3ff", "#000082", "#ff0000", "#ffff00"],
    humid: ["#ffe600", "#00c8ff", "#0000ff"],
    rad: ["#293a59", "#960c2c", "#ff0000", "#ff7b00", "#fffc00", "#ffff7b", "#ffffff"],
    light: ["#4d6daa", "#a0beed", "#f1e969", "#eb7d05", "#d81600"],
    bright: ["#730a8c", "#0d0db3", "#0f85be", "#0f85be", "#b11421", "#fdf130"],
    wind: ["#ffffff", "#b2f2ff", "#33ddff", "#00aaff", "#0055ff", "#0000ff", "#aa00ff", "#ff00ff", "#cc0000", "#ffaa00"],
    windDir: ["#0072dd", "#00c420", "#eded00", "#be00d5", "#0072dd"],
    cloud: ["#7ec9f3", "#e6eae9", "#c2c2c2"],
    hour: ["#000000", "#355e7e", "#6b5c7b", "#c06c84", "#f8b195", "#c92a42", "#c92a42", "#c92a42", "#000000"],
    pressure: ["#008080", "#33a6a6", "#66cccc", "#99e6e6", "#ccf2f2", "#ffffff", "#ffd6cc", "#ffad99", "#ff8566", "#ff5c33"],
  };

  const temp = { si: "°C", ip: "°F", toIp: function (v) { return v * 1.8 + 32; }, deltaToIp: function (v) { return v * 1.8; } };
  const irr = { si: "Wh/m²", ip: "Btu/ft²", toIp: function (v) { return v * 0.3169983306; } };
  const ill = { si: "lux", ip: "fc", toIp: function (v) { return v * 0.0929; } };
  const lum = { si: "cd/m²", ip: "cd/ft²", toIp: function (v) { return v * 0.0929; } };
  const spd = { si: "m/s", ip: "fpm", toIp: function (v) { return v * 196.85039370078738; } };
  const none = function (u) { return { si: u, ip: u, toIp: function (v) { return v; } }; };

  // key -> metadata. "explore" marks variables offered in selectors.
  const V = {
    DBT: { name: "Dry bulb temperature", u: temp, colors: C.temp, range: [-40, 50], explore: true },
    DPT: { name: "Dew point temperature", u: temp, colors: C.temp, range: [-50, 35], explore: true },
    RH: { name: "Relative humidity", u: none("%"), colors: C.humid, range: [0, 100], explore: true },
    p_atm: { name: "Atmospheric pressure", u: { si: "Pa", ip: "psi", toIp: function (v) { return v * 0.000145038; } }, colors: C.pressure, range: [95000, 105000], explore: true },
    extr_hor_rad: { name: "Extraterrestrial horizontal irradiation", u: irr, colors: C.rad, range: [0, 1200], explore: true },
    hor_ir_rad: { name: "Horizontal infrared radiation", u: irr, colors: C.rad, range: [0, 500], explore: true },
    glob_hor_rad: { name: "Global horizontal radiation", u: irr, colors: C.rad, range: [0, 1200], explore: true },
    dir_nor_rad: { name: "Direct normal radiation", u: irr, colors: C.rad, range: [0, 1200], explore: true },
    dif_hor_rad: { name: "Diffuse horizontal radiation", u: irr, colors: C.rad, range: [0, 1200], explore: true },
    glob_hor_ill: { name: "Global horizontal illuminance", u: ill, colors: C.light, range: [0, 120000], explore: true },
    dir_nor_ill: { name: "Direct normal illuminance", u: ill, colors: C.light, range: [0, 120000], explore: true },
    dif_hor_ill: { name: "Diffuse horizontal illuminance", u: ill, colors: C.light, range: [0, 120000], explore: true },
    Zlumi: { name: "Zenith luminance", u: lum, colors: C.bright, range: [0, 60000], explore: true },
    wind_dir: { name: "Wind direction", u: none("°"), colors: C.windDir, range: [0, 360], explore: true },
    wind_speed: { name: "Wind speed", u: spd, colors: C.wind, range: [0, 20], explore: true },
    tot_sky_cover: { name: "Total sky cover", u: none("tenths"), colors: C.cloud, range: [0, 10], explore: true },
    Oskycover: { name: "Opaque sky cover", u: none("tenths"), colors: C.cloud, range: [0, 10], explore: true },
    Vis: { name: "Visibility", u: { si: "km", ip: "miles", toIp: function (v) { return v * 0.6215; } }, colors: C.cloud, range: [0, 100], explore: true },
    elevation: { name: "Solar elevation", u: none("°"), colors: C.rad, range: [-90, 90], explore: true },
    azimuth: { name: "Solar azimuth", u: none("°"), colors: C.windDir, range: [0, 360], explore: true },
    hr: { name: "Humidity ratio", u: { si: "g/kg", ip: "gr/lb", toIp: function (v) { return v * 7; } }, colors: C.humid, range: [0, 30], explore: true },
    t_wb: { name: "Wet bulb temperature", u: temp, colors: C.temp, range: [-40, 40], explore: true },
    h: { name: "Enthalpy", u: { si: "kJ/kg", ip: "Btu/lb", toIp: function (v) { return v * 0.429923; } }, colors: C.rad, range: [-20, 120], explore: true },
    MRT: { name: "Mean radiant temperature (in sun)", u: temp, colors: C.temp, range: [-40, 90], explore: true },
    heat_index: { name: "Heat index", u: temp, colors: C.temp, range: [-10, 70], explore: true },
    utci_Sun_Wind: { name: "UTCI: sun & wind", u: temp, colors: C.temp, range: [-50, 50], explore: true },
    utci_Sun_noWind: { name: "UTCI: sun & no wind", u: temp, colors: C.temp, range: [-50, 50], explore: true },
    utci_noSun_Wind: { name: "UTCI: shade & wind", u: temp, colors: C.temp, range: [-50, 50], explore: true },
    utci_noSun_noWind: { name: "UTCI: shade & no wind", u: temp, colors: C.temp, range: [-50, 50], explore: true },
    adaptive_cmf: { name: "ASHRAE 55 adaptive comfort temperature", u: temp, colors: C.temp, range: [10, 35] },
    imac_nv: { name: "IMAC comfort temperature (NV)", u: temp, colors: C.temp, range: [10, 35], explore: true },
    imac_mm: { name: "IMAC comfort temperature (MM)", u: temp, colors: C.temp, range: [10, 35] },
    t30: { name: "30-day running mean outdoor temperature", u: temp, colors: C.temp, range: [0, 40], explore: true },
    hour: { name: "Hour of day", u: none("h"), colors: C.hour, range: [1, 24] },
    month: { name: "Month", u: none(""), colors: C.hour, range: [1, 12] },
    doy: { name: "Day of year", u: none("day"), colors: C.hour, range: [1, 365] },
  };

  App.V = V;
  App.COLORS = C;

  App.units = "si";

  App.unit = function (key) {
    const m = V[key];
    return m ? m.u[App.units] : "";
  };
  App.vname = function (key) { return V[key] ? V[key].name : key; };

  App.conv = function (key, v) {
    if (App.units !== "ip" || !V[key]) return v;
    return V[key].u.toIp(v);
  };
  App.convArr = function (key, arr) {
    if (App.units !== "ip" || !V[key]) return arr;
    const f = V[key].u.toIp, out = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = f(arr[i]);
    return out;
  };
  // display-unit value -> SI
  App.toSi = function (key, v) {
    if (App.units !== "ip" || !V[key]) return v;
    const a = V[key].u.toIp(0), b = V[key].u.toIp(1);
    return (v - a) / (b - a);
  };
  App.range = function (key) {
    const r = V[key].range;
    return [App.conv(key, r[0]), App.conv(key, r[1])];
  };
  App.colorscale = function (colors) {
    return colors.map(function (c, i) { return [i / (colors.length - 1), c]; });
  };
  App.exploreKeys = function () { return Object.keys(V).filter(function (k) { return V[k].explore; }); };
  App.tUnit = function () { return App.units === "ip" ? "°F" : "°C"; };
  App.tDelta = function (v) { return App.units === "ip" ? v * 1.8 : v; };
})(window.App);
