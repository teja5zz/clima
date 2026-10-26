/* Home: hero, weather-file loading, Indian city directory and tool overview. */
(function (App) {
  "use strict";
  const S = App.S;

  const TOOLS = [
    ["summary", "Climate summary", "Location, monthly statistics, degree days and climate profiles at a glance."],
    ["india", "Climate zone & IMAC comfort", "Automatic NBC 2016 / ECBC climate-zone classification and the India Model for Adaptive Comfort."],
    ["strategies", "Design strategy advisor", "Passive design recommendations ranked for your site's climate data."],
    ["temperature", "Temperature & humidity", "Annual, daily and hourly profiles with adaptive comfort bands."],
    ["sun", "Sun & clouds", "Sun path diagrams, solar radiation and sky cover."],
    ["shading", "Shading designer", "Size chajjas, overhangs and fins for any façade orientation."],
    ["wind", "Wind", "Annual, seasonal and day/night wind roses."],
    ["psychro", "Psychrometric chart", "Every hour of the year plotted with a comfort zone overlay."],
    ["ventilation", "Natural ventilation", "Hours suitable for opening windows, with condensation check."],
    ["outdoor", "Outdoor comfort & heat stress", "UTCI in sun / shade / wind scenarios and heat-index risk."],
    ["envelope", "Envelope & ENS calculator", "Wall / roof U-values with Indian materials and Eco-Niwas Samhita RETV checks."],
    ["explorer", "Data explorer", "Any variable as heatmap, profile or scatter with filters and CSV export."],
  ];

  App.views.home = {
    html: function () {
      const b = window.BRAND;
      const ds = App.state.ds;
      return '<section class="hero">' +
        '<div class="hero-text"><p class="eyebrow">' + App.esc(b.company) + "</p>" +
        "<h1>" + App.esc(b.product) + "</h1>" +
        '<p class="hero-lead">' + App.esc(b.tagline) + ". Analyse any Indian weather file in your browser, classify the climate under NBC 2016, check comfort with the India Model for Adaptive Comfort, and turn the data into passive design decisions.</p>" +
        '<div class="hero-cta"><button class="btn primary" type="button" data-scroll="load">Load weather data</button><button class="btn" type="button" data-scroll="tools">Explore the tools</button></div>' +
        '<ul class="hero-points"><li>Runs fully in your browser — your files never leave your computer</li><li>Free EPW data for 100+ Indian stations</li><li>Built on the open-source CBE Clima Tool</li></ul></div>' +
        '<div class="hero-art" aria-hidden="true">' + heroSvg() + "</div></section>" +

        App.card("1 · Load weather data", loader(ds), { id: "load", lead: "Upload an EnergyPlus Weather file (.epw) or the .zip you downloaded, paste a direct link, or open the demo." }) +

        App.card("2 · Find a weather file for your Indian city", cityFinder(), { lead: "Pick your city to see the nearest stations to look for, then download its EPW from one of the free sources below and drop it above. Zones shown are indicative; the tools recompute the zone from your file." }) +

        '<section class="card" id="tools"><header class="card-head"><h2>3 · Tools</h2></header><div class="tool-grid">' +
        TOOLS.map(function (t) {
          return '<a class="tool" href="#/' + t[0] + '"><h3>' + t[1] + "</h3><p>" + t[2] + "</p></a>";
        }).join("") + "</div></section>" +

        App.card("Why climate analysis matters for Indian buildings",
          '<div class="why-grid">' +
          '<div><h3>Five climates, one country</h3><p>India spans hot-dry deserts, warm-humid coasts, composite plains, temperate plateaus and cold Himalayan regions. A design that works in Jaipur can fail in Kochi.</p></div>' +
          '<div><h3>Comfort without air-conditioning</h3><p>Field studies behind the IMAC model show occupants of naturally ventilated Indian buildings accept a much wider temperature range than international defaults — saving energy when designed for.</p></div>' +
          '<div><h3>Rising heat stress</h3><p>Heat-wave days are increasing. Knowing when and where outdoor spaces become dangerous helps design shaded, ventilated and safer buildings and streets.</p></div>' +
          '<div><h3>Code compliance</h3><p>ECBC 2017 and Eco-Niwas Samhita set envelope limits by climate zone. Knowing your zone and envelope numbers early avoids costly redesign.</p></div></div>');
    },
    mount: function (root) {
      App.$$("[data-scroll]", root).forEach(function (b) { b.addEventListener("click", function () { App.$("#" + b.dataset.scroll, root).scrollIntoView({ behavior: "smooth" }); }); });
      const input = App.$("#file-input", root);
      App.$("#drop", root).addEventListener("click", function (e) { if (e.target.tagName !== "INPUT") input.click(); });
      App.$("#drop", root).addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
      input.addEventListener("change", function () { if (input.files[0]) App.loadFile(input.files[0]); });
      App.$("#url-form", root).addEventListener("submit", function (e) {
        e.preventDefault();
        const u = App.$("#url-input", root).value.trim();
        if (u) App.loadUrl(u);
      });
      App.$("#demo-btn", root).addEventListener("click", function () { App.loadUrl("data/demo/ITA_Bologna-Marconi_TMYx.zip"); });
      const cityInput = App.$("#city-search", root);
      cityInput.addEventListener("input", function () { renderCityTable(root, cityInput.value); });
      renderCityTable(root, "");
      drawMap(root);
    },
  };

  function loader(ds) {
    return '<div class="load-grid">' +
      '<div id="drop" class="drop" tabindex="0" role="button" aria-label="Upload EPW or ZIP file">' +
      '<div class="drop-icon" aria-hidden="true">⇪</div><strong>Drop an .epw or .zip file here</strong><span>or click to browse</span>' +
      '<input id="file-input" type="file" accept=".epw,.zip" hidden></div>' +
      '<div class="load-side">' +
      '<form id="url-form" class="field"><label for="url-input">Direct link to an .epw or .zip</label><div class="pair">' +
      '<input id="url-input" type="url" placeholder="https://…/IND_….epw"><button class="btn" type="submit">Load</button></div>' +
      '<small class="muted">Some servers block in-browser downloads; if so, download the file and drop it in.</small></form>' +
      '<div class="field"><label>No file yet?</label><button id="demo-btn" class="btn ghost" type="button">Open demo file (Bologna, Italy)</button>' +
      '<small class="muted">The demo is a sample from the Clima Tool repository, useful for exploring the interface. Use an Indian file for real projects.</small></div>' +
      (ds ? '<div class="loaded-note">Currently loaded: <strong>' + App.esc(ds.meta.city) + '</strong> · <a href="#/summary">open summary →</a></div>' : "") +
      "</div></div>";
  }

  function cityFinder() {
    return '<div class="city-grid"><div><div class="field"><label for="city-search">Search city or state</label>' +
      '<input id="city-search" type="search" placeholder="e.g. Pune, Kerala, Delhi"></div>' +
      '<div class="table-wrap city-table"><table><thead><tr><th>City</th><th>State / UT</th><th>Lat, Lon</th><th>Indicative zone</th></tr></thead><tbody id="city-body"></tbody></table></div></div>' +
      '<div><div id="india-map" class="chart map"></div></div></div>' +
      '<h3 class="sub">Free and licensed EPW sources</h3><ul class="sources">' +
      App.EPW_SOURCES.map(function (s) {
        return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + App.esc(s.name) + " ↗</a><span>" + App.esc(s.note) + "</span></li>";
      }).join("") + "</ul>";
  }

  function renderCityTable(root, q) {
    q = q.toLowerCase();
    const rows = App.INDIA_CITIES.filter(function (c) { return !q || (c.city + " " + c.state).toLowerCase().indexOf(q) >= 0; });
    App.$("#city-body", root).innerHTML = rows.map(function (c) {
      const z = c.zone ? S.NBC_ZONES[c.zone] : null;
      return "<tr><td>" + App.esc(c.city) + "</td><td>" + App.esc(c.state) + "</td><td>" + c.lat.toFixed(2) + ", " + c.lon.toFixed(2) + "</td><td>" +
        (z ? '<span class="zone-chip" style="--z:' + z.color + '">' + z.label + "</span>" : '<span class="muted">check with data</span>') + "</td></tr>";
    }).join("") || '<tr><td colspan="4" class="muted">No match — any EPW file in the world can still be analysed.</td></tr>';
  }

  function drawMap(root) {
    const el = App.$("#india-map", root);
    const groups = {};
    App.INDIA_CITIES.forEach(function (c) { const k = c.zone || "unknown"; (groups[k] = groups[k] || []).push(c); });
    const data = Object.keys(groups).map(function (k) {
      const z = S.NBC_ZONES[k];
      return { type: "scattergeo", lat: groups[k].map(function (c) { return c.lat; }), lon: groups[k].map(function (c) { return c.lon; }),
        text: groups[k].map(function (c) { return c.city; }), name: z ? z.label : "Check with data", mode: "markers",
        marker: { size: 9, color: z ? z.color : "#9a9188", line: { color: "#fff", width: 1 } },
        hovertemplate: "%{text}<extra>" + (z ? z.label : "") + "</extra>" };
    });
    if (App.state.ds) {
      const m = App.state.ds.meta;
      data.push({ type: "scattergeo", lat: [m.lat], lon: [m.lon], text: [m.city], name: "Loaded file", mode: "markers",
        marker: { size: 16, symbol: "star", color: "#111", line: { color: "#fff", width: 1 } }, hovertemplate: "%{text}<extra>loaded</extra>" });
    }
    App.Ch.render(el, { data: data, layout: {
      height: 460, margin: { l: 0, r: 0, t: 10, b: 10 }, legend: { orientation: "h", y: -0.02, font: { size: 11 } },
      geo: { scope: "asia", resolution: 50, showcountries: false, showcoastlines: true, coastlinecolor: "#9a9188",
        showland: true, landcolor: "#f4efe8", showocean: true, oceancolor: "#e3eef3", showlakes: false, bgcolor: "rgba(0,0,0,0)",
        lataxis: { range: [6, 37] }, lonaxis: { range: [67, 98] }, projection: { type: "mercator" } } } }, "india_map");
  }

  function heroSvg() {
    return '<svg viewBox="0 0 320 260" role="img"><defs><linearGradient id="hg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffe8cc"/><stop offset="1" stop-color="#fff7ed"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="320" height="260" rx="20" fill="url(#hg)"/>' +
      '<path d="M40 200 A120 120 0 0 1 280 200" fill="none" stroke="#f59f00" stroke-width="2" stroke-dasharray="4 6"/>' +
      '<path d="M70 200 A90 70 0 0 1 250 200" fill="none" stroke="#f08c00" stroke-width="1.5" stroke-dasharray="3 5"/>' +
      '<circle cx="200" cy="92" r="20" fill="#f59f00"/><g stroke="#f59f00" stroke-width="3" stroke-linecap="round">' +
      '<line x1="200" y1="58" x2="200" y2="64"/><line x1="234" y1="92" x2="228" y2="92"/><line x1="224" y1="68" x2="219" y2="73"/><line x1="176" y1="68" x2="181" y2="73"/></g>' +
      '<rect x="92" y="140" width="110" height="60" fill="#c2410c" opacity="0.9"/><polygon points="84,142 147,108 210,142" fill="#7c2d12"/>' +
      '<rect x="80" y="140" width="134" height="6" fill="#431407"/>' +
      '<rect x="108" y="158" width="20" height="22" fill="#fff7ed"/><rect x="166" y="158" width="20" height="22" fill="#fff7ed"/>' +
      '<rect x="138" y="166" width="18" height="34" fill="#431407"/>' +
      '<g fill="#fff7ed" opacity="0.9"><circle cx="113" cy="163" r="1.5"/><circle cx="118" cy="168" r="1.5"/><circle cx="123" cy="163" r="1.5"/><circle cx="113" cy="173" r="1.5"/><circle cx="123" cy="173" r="1.5"/></g>' +
      '<path d="M228 200 q10 -40 20 0" fill="#2f9e44"/><path d="M240 200 q14 -60 28 0" fill="#2b8a3e"/>' +
      '<path d="M20 120 q30 -8 60 0 t60 0" fill="none" stroke="#1f8a9e" stroke-width="2" opacity="0.7"/>' +
      '<path d="M30 105 q30 -8 60 0 t60 0" fill="none" stroke="#1f8a9e" stroke-width="2" opacity="0.4"/>' +
      '<rect x="20" y="200" width="280" height="4" fill="#a8a29e"/></svg>';
  }
})(window.App);
