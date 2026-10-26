/* Climate summary: location, headline statistics, monthly table, degree days, profiles. */
(function (App) {
  "use strict";
  const S = App.S, Ch = App.Ch;

  App.views.summary = {
    html: function () {
      const ds = App.state.ds, m = ds.meta, d = ds.d;
      const t = App.tUnit();
      const ghiAnnual = S.sum(d.glob_hor_rad) / 1000;
      const z = S.NBC_ZONES[ds.nbc.zone];
      const hot = ds.daily.max.filter(function (v) { return v >= 40; }).length;
      const stats = '<div class="stats">' +
        App.stat("NBC 2016 climate zone", '<span class="zone-chip big" style="--z:' + z.color + '">' + z.label + "</span>", ds.nbc.zone === "composite" ? "no single type for ≥ 6 months" : (ds.nbc.counts[ds.nbc.zone] + " of 12 months")) +
        App.stat("Annual mean temperature", App.fmt(App.conv("DBT", S.mean(d.DBT))) + " " + t) +
        App.stat("Hottest hour / coldest hour", App.fmt(App.conv("DBT", S.max(d.DBT))) + " / " + App.fmt(App.conv("DBT", S.min(d.DBT))) + " " + t) +
        App.stat("Mean relative humidity", App.fmt(S.mean(d.RH), 0) + " %") +
        App.stat("Annual global horizontal radiation", App.fmt(App.units === "ip" ? ghiAnnual * 317 : ghiAnnual, 0) + (App.units === "ip" ? " Btu/ft²" : " kWh/m²")) +
        App.stat("Mean wind speed", App.fmt(App.conv("wind_speed", S.mean(d.wind_speed)), App.units === "ip" ? 0 : 1) + " " + App.unit("wind_speed")) +
        App.stat("Days with max ≥ 40 °C", hot, "indicative heat-wave threshold for the plains (IMD)") +
        App.stat("Hours UTCI ≥ 32 °C in sun", countAbove(d.utci_Sun_noWind, 32), "strong heat stress or worse") +
        "</div>";

      const loc = '<dl class="meta">' +
        "<div><dt>Location</dt><dd>" + App.esc([m.city, m.state, m.country].filter(Boolean).join(", ")) + "</dd></div>" +
        "<div><dt>Coordinates</dt><dd>" + m.lat.toFixed(3) + "°, " + m.lon.toFixed(3) + "°</dd></div>" +
        "<div><dt>Elevation</dt><dd>" + App.fmt(m.elevation, 0) + " m</dd></div>" +
        "<div><dt>Time zone</dt><dd>UTC" + (m.tz >= 0 ? "+" : "") + m.tz + "</dd></div>" +
        "<div><dt>Data source</dt><dd>" + App.esc(m.source || "–") + (m.wmo ? " · WMO " + App.esc(m.wmo) : "") + "</dd></div>" +
        "<div><dt>Period of record</dt><dd>" + App.esc(m.period || "–") + "</dd></div>" +
        "<div><dt>File</dt><dd class='wrap'>" + App.esc(m.file) + "</dd></div></dl>" +
        '<div class="btn-row"><button class="btn" id="dl-csv" type="button">Download processed data (CSV)</button><button class="btn ghost" id="print" type="button">Print / save as PDF</button></div>';

      return App.pageHead("Climate summary", "Key facts about the weather file you loaded.") +
        App.card("Headline numbers", stats) +
        '<div class="two-col">' + App.card("Location", loc) + App.card("Where in India?", App.chartBox("sum-map", "map-sm")) + "</div>" +
        App.card("Monthly statistics", monthlyTable(ds)) +
        App.card("Heating & cooling degree days", '<div class="controls">' +
          '<div class="field"><label for="hdd">Heating base (' + t + ')</label><input id="hdd" type="number" step="0.5" value="' + App.fmt(App.conv("DBT", 18)) + '"></div>' +
          '<div class="field"><label for="cdd">Cooling base (' + t + ')</label><input id="cdd" type="number" step="0.5" value="' + App.fmt(App.conv("DBT", 18)) + '"></div>' +
          '<div id="dd-total" class="dd-total"></div></div>' + App.chartBox("dd-chart"),
          { lead: "Degree days measure how much, and for how long, outdoor temperature sits below (heating) or above (cooling) a base temperature. 18 °C is the common reference; raise the cooling base to reflect adaptive comfort." }) +
        App.card("Climate profiles", '<div class="grid-2">' + App.chartBox("box-dbt") + App.chartBox("box-rh") + App.chartBox("box-ghi") + App.chartBox("box-ws") + "</div>",
          { lead: "Distribution of hourly values in each month (box = middle 50 % of hours, whiskers = typical range). Solar radiation shows daylight hours only." });
    },
    mount: function (root) {
      const ds = App.state.ds;
      const dd = function () {
        const h = App.toSi("DBT", +App.$("#hdd", root).value), c = App.toSi("DBT", +App.$("#cdd", root).value);
        const f = Ch.degreeDays(ds, h, c);
        App.$("#dd-total", root).innerHTML = "<strong>" + App.fmt(f.hdd, 0) + "</strong> HDD · <strong>" + App.fmt(f.cdd, 0) + "</strong> CDD per year";
        Ch.render("dd-chart", f, "degree_days");
      };
      App.$("#hdd", root).addEventListener("input", dd);
      App.$("#cdd", root).addEventListener("input", dd);
      dd();
      Ch.render("box-dbt", Ch.monthlyBox(ds, "DBT", "Dry bulb temperature"), "dbt_profile");
      Ch.render("box-rh", Ch.monthlyBox(ds, "RH", "Relative humidity"), "rh_profile");
      Ch.render("box-ghi", Ch.monthlyBox(ds, "glob_hor_rad", "Global horizontal radiation (daylight hours)"), "ghi_profile");
      Ch.render("box-ws", Ch.monthlyBox(ds, "wind_speed", "Wind speed"), "wind_profile");
      const m = ds.meta;
      Ch.render("sum-map", { data: [{ type: "scattergeo", lat: [m.lat], lon: [m.lon], text: [m.city], mode: "markers",
        marker: { size: 14, color: window.BRAND.accent || "#c2410c", symbol: "star", line: { color: "#fff", width: 1 } }, hovertemplate: "%{text}<extra></extra>" }],
      layout: { height: 300, margin: { l: 0, r: 0, t: 0, b: 0 }, showlegend: false,
        geo: { scope: Math.abs(m.lat - 22) < 18 && Math.abs(m.lon - 82) < 22 ? "asia" : "world", resolution: Math.abs(m.lat - 22) < 18 && Math.abs(m.lon - 82) < 22 ? 50 : 110, showcountries: false, showcoastlines: true, coastlinecolor: "#9a9188",
          showland: true, landcolor: "#f4efe8", showocean: true, oceancolor: "#e3eef3", bgcolor: "rgba(0,0,0,0)",
          center: { lat: m.lat, lon: m.lon }, projection: { type: "mercator", scale: Math.abs(m.lat - 22) < 18 && Math.abs(m.lon - 82) < 22 ? 2.5 : 1 } } } }, "location");
      App.$("#dl-csv", root).addEventListener("click", function () {
        const blob = new Blob([App.toCsv(ds)], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = (window.BRAND.company + "_" + ds.meta.city + "_climate_data.csv").replace(/\s+/g, "_");
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      });
      App.$("#print", root).addEventListener("click", function () { window.print(); });
    },
  };

  function countAbove(arr, v) { let n = 0; for (const x of arr) if (x >= v) n++; return n; }

  function monthlyTable(ds) {
    const t = App.tUnit();
    const hasP = ds.monthly[0].precip !== null;
    let h = '<div class="table-wrap"><table class="num"><thead><tr><th>Month</th><th>Mean ' + t + "</th><th>Mean max " + t + "</th><th>Mean min " + t +
      "</th><th>Mean RH %</th><th>Daily solar " + (App.units === "ip" ? "kBtu/ft²" : "kWh/m²") + "</th><th>Wind " + App.unit("wind_speed") + "</th>" +
      (hasP ? "<th>Rain mm</th>" : "") + "<th>NBC type</th></tr></thead><tbody>";
    ds.monthly.forEach(function (r, i) {
      const z = S.NBC_ZONES[ds.nbc.months[i]];
      h += "<tr><td>" + S.MONTHS[i] + "</td><td>" + App.fmt(App.conv("DBT", r.tMean)) + "</td><td>" + App.fmt(App.conv("DBT", r.tMax)) + "</td><td>" +
        App.fmt(App.conv("DBT", r.tMin)) + "</td><td>" + App.fmt(r.rh, 0) + "</td><td>" + App.fmt(App.units === "ip" ? r.ghiDaily * 0.317 : r.ghiDaily, 2) + "</td><td>" +
        App.fmt(App.conv("wind_speed", r.wind), App.units === "ip" ? 0 : 1) + "</td>" + (hasP ? "<td>" + App.fmt(r.precip, 0) + "</td>" : "") +
        '<td><span class="zone-chip" style="--z:' + z.color + '">' + z.label + "</span></td></tr>";
    });
    return h + "</tbody></table></div>";
  }
})(window.App);
