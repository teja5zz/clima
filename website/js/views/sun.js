/* Sun & clouds: sun path diagrams, radiation profiles, sky cover. */
(function (App) {
  "use strict";
  const Ch = App.Ch, S = App.S;
  let sel = { view: "polar", color: "DBT", heat: "glob_hor_rad" };
  const SOLAR_VARS = ["glob_hor_rad", "dir_nor_rad", "dif_hor_rad", "glob_hor_ill", "dif_hor_ill", "tot_sky_cover", "elevation", "MRT"];

  App.views.sun = {
    html: function () {
      const ds = App.state.ds, m = ds.meta;
      const noonJun = solarNoon(S.doyOf(6, 21), m);
      const noonDec = solarNoon(S.doyOf(12, 21), m);
      const tropic = Math.abs(m.lat) < 23.44;
      return App.pageHead("Sun & clouds", "Where the sun is, how strong it is, and how often clouds block it.") +
        App.card("Solar geometry at a glance", '<div class="stats">' +
          App.stat("Noon sun altitude, 21 June", App.fmt(noonJun.elevation, 0) + "°", tropic && m.lat > 0 ? "sun is to the " + (noonJun.azimuth > 90 && noonJun.azimuth < 270 ? "south" : "north") + " at noon" : "") +
          App.stat("Noon sun altitude, 21 December", App.fmt(noonDec.elevation, 0) + "°", "low winter sun from the south") +
          App.stat("Annual global horizontal", App.fmt(S.sum(ds.d.glob_hor_rad) / 1000, 0) + " kWh/m²") +
          App.stat("Annual direct normal", App.fmt(S.sum(ds.d.dir_nor_rad) / 1000, 0) + " kWh/m²") +
          "</div>" + (tropic && m.lat > 0 ? '<p class="note">Your site lies south of the Tropic of Cancer: around midsummer the sun passes <strong>north</strong> of the zenith, so north façades receive direct sun in the morning and evening — plan shading for them too.</p>' : "")) +
        '<div class="toolbar"><div class="field"><label for="s-view">Sun path view</label><select id="s-view"><option value="polar">Polar (plan view)</option><option value="cart">Cartesian</option></select></div>' +
        '<div class="field"><label for="s-color">Colour hours by</label><select id="s-color">' + App.varOptions(sel.color, ["DBT", "RH", "glob_hor_rad", "dir_nor_rad", "dif_hor_rad", "tot_sky_cover", "utci_Sun_Wind", "MRT"], true) + "</select></div></div>" +
        App.card("", App.chartBox("s-path", "tall"), { lead: "Each dot is one daylight hour from the weather file. Grey loops (analemmas) mark each clock hour; dark lines show the solstices and equinoxes. Hot hours coming from the west are the ones to shade first." }) +
        App.card("", App.chartBox("s-monthly")) +
        '<div class="two-col">' + App.card("", App.chartBox("s-cloud")) + App.card("", '<div class="field"><label for="s-heat">Heatmap variable</label><select id="s-heat">' + App.varOptions(sel.heat, SOLAR_VARS) + "</select></div>" + App.chartBox("s-heat-chart")) + "</div>";
    },
    mount: function (root) {
      const ds = App.state.ds;
      App.$("#s-view", root).value = sel.view;
      const drawPath = function () {
        sel.view = App.$("#s-view", root).value; sel.color = App.$("#s-color", root).value;
        Ch.render("s-path", sel.view === "polar" ? Ch.sunPathPolar(ds, sel.color) : Ch.sunPathCartesian(ds, sel.color), "sun_path");
      };
      const drawHeat = function () {
        sel.heat = App.$("#s-heat", root).value;
        Ch.render("s-heat-chart", Ch.heatmap(ds, sel.heat, { height: 330 }), "heatmap_" + sel.heat);
      };
      App.$("#s-view", root).addEventListener("change", drawPath);
      App.$("#s-color", root).addEventListener("change", drawPath);
      App.$("#s-heat", root).addEventListener("change", drawHeat);
      drawPath(); drawHeat();
      Ch.render("s-monthly", Ch.monthlySolar(ds), "monthly_solar");
      const cc = Ch.cloudCover(ds);
      if (cc.valid) Ch.render("s-cloud", cc, "cloud_cover");
      else App.$("#s-cloud", root).innerHTML = '<p class="muted">This weather file has no sky-cover data.</p>';
    },
  };

  function solarNoon(doy, m) {
    let best = null;
    for (let t = 9; t <= 15; t += 0.02) {
      const p = S.solarPosition(doy, t, m.lat, m.lon, m.tz);
      if (!best || p.elevation > best.elevation) best = p;
    }
    return best;
  }
})(window.App);
