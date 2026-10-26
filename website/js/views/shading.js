/* Shading designer: size overhangs (chajjas) and side fins from the site's sun positions. */
(function (App) {
  "use strict";
  const Ch = App.Ch, S = App.S;
  const FACES = [["North", 0], ["North-east", 45], ["East", 90], ["South-east", 135], ["South", 180], ["South-west", 225], ["West", 270], ["North-west", 315]];
  let sel = { az: 180, H: 1.5, W: 1.2, D: 0.6, F: 0, m0: 3, m1: 10, h0: 8, h1: 18, warmOnly: true };

  App.views.shading = {
    html: function () {
      return App.pageHead("Shading designer", "Size a chajja (horizontal overhang) and side fins for a window, using this site's actual sun positions and warm hours.") +
        '<div class="two-col wide-left">' +
        App.card("Window & period", '<div class="form-grid">' +
          '<div class="field"><label for="sh-face">Façade faces</label><select id="sh-face">' + FACES.map(function (f) { return '<option value="' + f[1] + '"' + (f[1] === sel.az ? " selected" : "") + ">" + f[0] + " (" + f[1] + "°)</option>"; }).join("") + '<option value="custom">Custom azimuth…</option></select></div>' +
          '<div class="field" id="sh-az-wrap" hidden><label for="sh-az">Façade azimuth (° from north, clockwise)</label><input id="sh-az" type="number" min="0" max="359" value="' + sel.az + '"></div>' +
          '<div class="field"><label for="sh-H">Window height (m)</label><input id="sh-H" type="number" step="0.05" min="0.1" value="' + sel.H + '"></div>' +
          '<div class="field"><label for="sh-W">Window width (m)</label><input id="sh-W" type="number" step="0.05" min="0.1" value="' + sel.W + '"></div>' +
          App.timeFilter("sh", sel) +
          '<div class="field"><label class="check"><input id="sh-warm" type="checkbox"' + (sel.warmOnly ? " checked" : "") + "> Only hours warmer than the IMAC comfort lower limit</label></div>" +
          "</div>") +
        App.card("Required depth", '<div id="sh-req" class="stats"></div><p class="muted small">Depth of a horizontal overhang placed at the window head (extending past both sides) or of vertical fins on both jambs, needed to keep the whole window in shade for the given share of target sun-hours.</p>') +
        "</div>" +
        App.card("Test your design", '<div class="toolbar">' +
          '<div class="field"><label for="sh-D">Overhang / chajja depth (m)</label><input id="sh-D" type="number" step="0.05" min="0" value="' + sel.D + '"></div>' +
          '<div class="field"><label for="sh-F">Side fin depth (m)</label><input id="sh-F" type="number" step="0.05" min="0" value="' + sel.F + '"></div>' +
          '<div id="sh-res" class="stats inline"></div></div>' +
          '<div class="two-col">' + App.chartBox("sh-angles") + App.chartBox("sh-month") + "</div>",
          { lead: "Left: every target hour plotted by its horizontal (HSA) and vertical (VSA) shadow angle — points above the overhang line and outside the fin lines are fully shaded. Right: direct sun reaching the window, without and with your shading." }) +
        App.card("Rules of thumb for India", '<ul class="tips">' +
          "<li><strong>South façades</strong> (north of the tropics): a horizontal chajja works well — the high summer sun is easily cut off while low winter sun can still enter.</li>" +
          "<li><strong>East and west façades</strong>: the sun is low; horizontal overhangs need impractical depths. Use vertical fins, jaalis, louvres, external blinds, deep verandahs or trees.</li>" +
          "<li><strong>North façades</strong> south of ~23.4°N receive early-morning and late-afternoon summer sun — short fins or a small chajja help.</li>" +
          "<li>Leave a gap between the chajja and the wall, or use louvres, to let hot air escape and daylight reflect in.</li>" +
          "<li>Eco-Niwas Samhita credits external shading through an <em>External Shading Factor</em> that lowers the effective SHGC — use the result in the <a href='#/envelope'>RETV calculator</a>.</li></ul>");
    },
    mount: function (root) {
      const ds = App.state.ds;
      const faceSel = App.$("#sh-face", root);
      const draw = function () {
        const custom = faceSel.value === "custom";
        App.$("#sh-az-wrap", root).hidden = !custom;
        sel.az = custom ? ((+App.$("#sh-az", root).value % 360) + 360) % 360 : +faceSel.value;
        sel.H = Math.max(0.1, +App.$("#sh-H", root).value); sel.W = Math.max(0.1, +App.$("#sh-W", root).value);
        sel.D = Math.max(0, +App.$("#sh-D", root).value); sel.F = Math.max(0, +App.$("#sh-F", root).value);
        sel.warmOnly = App.$("#sh-warm", root).checked;
        Object.assign(sel, App.readTime("sh"));
        compute(ds, root);
      };
      App.$$("#main select, #main input").forEach(function (e) { e.addEventListener("change", draw); e.addEventListener("input", draw); });
      draw();
    },
  };

  function compute(ds, root) {
    const d = ds.d, mask = Ch.mask(ds, sel), D2R = Math.PI / 180;
    const hsa = [], vsa = [], col = [], txt = [], depthO = [], depthF = [];
    const unsh = new Array(12).fill(0), shd = new Array(12).fill(0);
    let fully = 0, tot = 0;
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i] || d.elevation[i] <= 0 || d.dir_nor_rad[i] < 50) continue;
      if (sel.warmOnly && d.DBT[i] < d.imac_nv_low[i]) continue;
      let h = d.azimuth[i] - sel.az;
      h = ((h + 540) % 360) - 180;
      if (Math.abs(h) >= 90) continue; // sun behind façade
      const alt = d.elevation[i];
      const v = Math.atan(Math.tan(alt * D2R) / Math.cos(h * D2R)) / D2R;
      tot++;
      hsa.push(h); vsa.push(v); col.push(App.conv("DBT", d.DBT[i]));
      txt.push(d.day[i] + " " + S.MONTHS[d.month[i] - 1] + " " + d.hour[i] + "h");
      depthO.push(sel.H / Math.tan(Math.max(v, 0.5) * D2R));
      depthF.push(Math.abs(h) < 0.5 ? Infinity : sel.W / Math.tan(Math.abs(h) * D2R));
      const inc = Math.cos(alt * D2R) * Math.cos(h * D2R);
      const beam = d.dir_nor_rad[i] * inc / 1000; // kWh/m² on façade
      const fo = Math.max(0, 1 - sel.D * Math.tan(v * D2R) / sel.H);
      const ff = Math.max(0, 1 - sel.F * Math.tan(Math.abs(h) * D2R) / sel.W);
      const m = d.month[i] - 1;
      unsh[m] += beam; shd[m] += beam * fo * ff;
      if (fo * ff === 0) fully++;
    }
    const q = function (arr, p) { return S.quantile(arr.map(function (x) { return Math.min(x, 20); }), p); };
    App.$("#sh-req", root).innerHTML = tot ? (
      App.stat("Overhang for 100 % of hours", App.fmt(q(depthO, 1), 2) + " m", "projection factor " + App.fmt(q(depthO, 1) / sel.H, 2)) +
      App.stat("Overhang for 90 % of hours", App.fmt(q(depthO, 0.9), 2) + " m", "projection factor " + App.fmt(q(depthO, 0.9) / sel.H, 2)) +
      App.stat("Overhang for 75 % of hours", App.fmt(q(depthO, 0.75), 2) + " m") +
      App.stat("Side fins for 90 % of hours", App.fmt(q(depthF, 0.9), 2) + " m", "fins on both sides")) :
      '<p class="muted">The sun does not reach this façade during the selected warm hours — no shading needed.</p>';
    const tu = S.sum(unsh), ts = S.sum(shd);
    App.$("#sh-res", root).innerHTML = tot ? App.stat("Target hours fully shaded", (100 * fully / tot).toFixed(0) + " %", fully + " of " + tot + " sun-hours") +
      App.stat("Direct solar gain blocked", tu ? (100 * (1 - ts / tu)).toFixed(0) + " %" : "–", App.fmt(tu - ts, 0) + " of " + App.fmt(tu, 0) + " kWh/m²") : "";
    // shadow-angle chart
    const D = sel.D, F = sel.F;
    const lines = [];
    if (D > 0) {
      const x = [], y = [];
      for (let h = -89; h <= 89; h++) { x.push(h); y.push(Math.atan(sel.H / D) / D2R); }
      lines.push({ x: x, y: y, mode: "lines", name: "Overhang cut-off (VSA)", line: { color: "#7c2d12", width: 2 } });
    }
    if (F > 0) {
      const a = Math.atan(sel.W / F) / D2R;
      lines.push({ x: [a, a, null, -a, -a], y: [0, 90, null, 0, 90], mode: "lines", name: "Fin cut-off (HSA)", line: { color: "#1c7ed6", width: 2, dash: "dash" } });
    }
    Ch.render("sh-angles", { data: [{ type: "scattergl", x: hsa, y: vsa, mode: "markers", text: txt, name: "Target sun-hours",
      marker: { size: 5, color: col, colorscale: App.colorscale(App.V.DBT.colors), showscale: true, colorbar: { title: { text: App.tUnit() }, thickness: 10 } },
      hovertemplate: "%{text}<br>HSA %{x:.0f}°, VSA %{y:.0f}°<extra></extra>" }].concat(lines),
    layout: { height: 400, title: { text: "Shadow angles of target sun-hours", x: 0.01, font: { size: 14 } },
      xaxis: { title: "Horizontal shadow angle (°)  ← left · right →", range: [-90, 90], gridcolor: Ch.GRID },
      yaxis: { title: "Vertical shadow angle (°)", range: [0, 90], gridcolor: Ch.GRID }, legend: { orientation: "h", y: -0.25 } } }, "shadow_angles");
    Ch.render("sh-month", { data: [
      { type: "bar", x: S.MONTHS, y: unsh, name: "Unshaded window", marker: { color: "#f08c00" }, hovertemplate: "%{y:.1f} kWh/m²<extra>unshaded</extra>" },
      { type: "bar", x: S.MONTHS, y: shd, name: "With your shading", marker: { color: "#2f9e44" }, hovertemplate: "%{y:.1f} kWh/m²<extra>shaded</extra>" },
    ], layout: { barmode: "group", height: 400, title: { text: "Direct sun on the window (target hours)", x: 0.01, font: { size: 14 } },
      yaxis: { title: "kWh/m²", gridcolor: Ch.GRID }, legend: { orientation: "h", y: -0.2 } } }, "facade_direct_sun");
  }
})(window.App);
