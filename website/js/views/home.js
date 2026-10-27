/* Home: hero, one-click Indian weather stations, file upload and tool overview. */
(function (App) {
  "use strict";
  const S = App.S;

  const TOOLS = [
    ["vastu", "Vastu × Science planner", "Draw your plot, pick 1–4 BHK rooms and get a layout placed by Vastu and this site's real sun, heat and wind — then drag to refine with live scores and print a report."],
    ["summary", "Climate summary", "Location, monthly statistics, degree days and climate profiles at a glance."],
    ["india", "Climate zone & IMAC comfort", "Automatic NBC 2016 / ECBC climate-zone classification and the India Model for Adaptive Comfort."],
    ["strategies", "Design strategy advisor", "Passive design recommendations ranked for your site's climate data."],
    ["temperature", "Temperature & humidity", "Annual, daily and hourly profiles with adaptive comfort bands."],
    ["sun", "Sun & clouds", "Sun path diagrams, solar radiation and sky cover."],
    ["shading", "Shading designer", "Size chajjas, overhangs and fins for any façade orientation."],
    ["wind", "Wind", "Annual, monsoon-season and day/night wind roses."],
    ["psychro", "Psychrometric chart", "Every hour of the year plotted with a comfort zone overlay."],
    ["ventilation", "Natural ventilation", "Hours suitable for opening windows, with condensation check."],
    ["outdoor", "Outdoor comfort & heat stress", "UTCI in sun / shade / wind scenarios and heat-index risk."],
    ["envelope", "Envelope & ENS calculator", "Wall / roof U-values with Indian materials and Eco-Niwas Samhita RETV checks."],
    ["explorer", "Data explorer", "Any variable as heatmap, profile or scatter with filters and CSV export."],
  ];
  const QUICK = ["Mysuru", "Bengaluru", "New Delhi", "Mumbai", "Chennai", "Kolkata", "Hyderabad", "Ahmedabad", "Pune", "Jaipur"];
  const ALIASES = { bengaluru: "bangalore", mysuru: "mysore", mangaluru: "mangalore", kochi: "cochin", thiruvananthapuram: "trivandrum",
    kolkata: "calcutta", chennai: "madras", mumbai: "bombay", vadodara: "baroda", puducherry: "pondicherry", gurugram: "gurgaon",
    prayagraj: "allahabad", belagavi: "belgaum", hubballi: "hubli", kalaburagi: "gulbarga", visakhapatnam: "vishakhapatnam" };

  let stations = null, anchor = null, query = "", selected = null;

  // When the site carries a weather-file mirror, offer only the files that were mirrored
  // (the rest are broken upstream links) and drop stations left without any.
  App.loadStations = async function () {
    if (stations) return stations;
    const got = await Promise.all([fetch(window.SITE.stationCatalogue).then(function (r) { return r.json(); }), App.epwMirror()]);
    const list = got[0], mirror = got[1];
    stations = !mirror.size ? list : list.map(function (s) {
      return Object.assign({}, s, { f: s.f.filter(function (f) { return mirror.has(decodeURIComponent(new URL(f[1]).pathname.split("/").pop())); }) });
    }).filter(function (s) { return s.f.length; });
    return stations;
  };

  App.views.home = {
    html: function () {
      const b = window.BRAND;
      const ds = App.state.ds;
      return '<section class="hero">' +
        '<div class="hero-text"><img class="hero-word" src="' + App.esc(b.wordmarkLight || "") + '" alt="' + App.esc(b.company) + '" width="196" height="104">' +
        '<p class="eyebrow">' + App.esc(b.product) + "</p>" +
        "<h1>" + App.esc(b.tagline) + "</h1>" +
        '<p class="hero-lead">Pick any of 400+ Indian weather stations to see your climate, check comfort with the India Model for Adaptive Comfort, and plan every room with Vastu and building science together — with shading, ventilation and materials worked out for your site.</p>' +
        '<div class="hero-cta"><button class="btn light" type="button" data-scroll="stations">Find my city</button><a class="btn outline-light" href="#/vastu">Open the Vastu × Science planner →</a></div>' +
        '<ul class="hero-points"><li>400+ Indian weather stations</li><li>Vastu × climate room placement</li><li>Plans and files stay on your device</li></ul></div></section>' +

        App.card("1 · Choose your location", stationFinder(), { id: "stations",
          lead: "Search a city, district or state, or use your location. We list the nearest weather stations; press <strong>Analyse</strong> to load one. Files come from Climate.OneBuilding.org and EnergyPlus (ISHRAE / IWEC)." }) +

        App.card("…or use your own weather file", loader(ds), { id: "load", lead: "Upload an EnergyPlus Weather file (.epw) or .zip, or paste a direct link." }) +

        '<section class="card" id="tools"><header class="card-head"><h2>2 · Tools</h2></header><div class="tool-grid">' +
        TOOLS.map(function (t, i) {
          return '<a class="tool' + (i === 0 ? " tool-feature" : "") + '" href="#/' + t[0] + '"><h3>' + t[1] + "</h3><p>" + t[2] + "</p></a>";
        }).join("") + "</div></section>" +

        App.card("Why climate analysis matters for Indian buildings",
          '<div class="why-grid">' +
          '<div><h3>Five climates, one country</h3><p>India spans hot-dry deserts, warm-humid coasts, composite plains, temperate plateaus and cold Himalayan regions. A design that works in Jaipur can fail in Kochi.</p></div>' +
          '<div><h3>Vastu meets science</h3><p>Many Vastu placements — a cool south-west bedroom wall, an east-facing pooja room for morning light, toilets as buffers on hot façades — have climatic logic. The planner shows where they agree with your site\'s data and how to handle conflicts.</p></div>' +
          '<div><h3>Comfort without air-conditioning</h3><p>Field studies behind the IMAC model show occupants of naturally ventilated Indian buildings accept a much wider temperature range than international defaults — saving energy when designed for.</p></div>' +
          '<div><h3>Code compliance</h3><p>NBC 2016, ECBC 2017 and Eco-Niwas Samhita set requirements by climate zone. Knowing your zone and envelope numbers early avoids costly redesign.</p></div></div>');
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

      const q = App.$("#st-search", root);
      q.value = query;
      q.addEventListener("input", function () { query = q.value; anchor = null; renderResults(root); });
      App.$("#st-near", root).addEventListener("click", function () {
        if (!navigator.geolocation) { App.toast("Location is not available in this browser.", "warn"); return; }
        navigator.geolocation.getCurrentPosition(function (p) {
          anchor = { lat: p.coords.latitude, lon: p.coords.longitude, label: "your location" };
          query = ""; q.value = ""; renderResults(root);
        }, function () { App.toast("Could not read your location — search by city instead.", "warn"); }, { timeout: 10000 });
      });
      App.$$("[data-quick]", root).forEach(function (b) {
        b.addEventListener("click", function () { query = b.dataset.quick; q.value = query; anchor = null; renderResults(root); });
      });
      App.$("#st-results", root).addEventListener("click", function (e) {
        const btn = e.target.closest("[data-load]");
        if (!btn) return;
        const sel = App.$("#src-" + btn.dataset.load, root);
        App.loadUrl(sel ? sel.value : btn.dataset.url);
      });
      App.loadStations().then(function () { renderResults(root); drawMap(root); })
        .catch(function () { App.$("#st-results", root).innerHTML = '<p class="muted">Station list could not be loaded.</p>'; });
    },
  };

  function stationFinder() {
    return '<div class="finder"><div class="finder-left">' +
      '<div class="pair finder-search"><input id="st-search" type="search" placeholder="City, district or state — e.g. Mysuru, Kerala" aria-label="Search weather stations">' +
      '<button id="st-near" class="btn" type="button">◎ Near me</button></div>' +
      '<div class="quick">' + QUICK.map(function (c) { return '<button class="chip" type="button" data-quick="' + c + '">' + c + "</button>"; }).join("") + "</div>" +
      '<div id="st-results" class="st-results" aria-live="polite"><p class="muted">Loading stations…</p></div></div>' +
      '<div class="finder-right"><div id="india-map" class="chart map"></div><p class="muted small">Coastlines only; tap a dot to list that station. Larger dots are the current results.</p></div></div>' +
      '<details class="acc"><summary>Other weather data sources</summary><ul class="sources">' +
      App.EPW_SOURCES.map(function (s) {
        return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + App.esc(s.name) + " ↗</a><span>" + App.esc(s.note) + "</span></li>";
      }).join("") + "</ul></details>";
  }

  function loader(ds) {
    return '<div class="load-grid">' +
      '<div id="drop" class="drop" tabindex="0" role="button" aria-label="Upload EPW or ZIP file">' +
      '<div class="drop-icon" aria-hidden="true">⇪</div><strong>Drop an .epw or .zip file here</strong><span>or click to browse</span>' +
      '<input id="file-input" type="file" accept=".epw,.zip" hidden></div>' +
      '<div class="load-side">' +
      '<form id="url-form" class="field"><label for="url-input">Link to an .epw or .zip</label><div class="pair">' +
      '<input id="url-input" type="url" placeholder="https://climate.onebuilding.org/…zip"><button class="btn" type="submit">Load</button></div></form>' +
      '<div class="field"><label>Offline sample</label><button id="demo-btn" class="btn ghost" type="button">Open sample file (Bologna, Italy)</button>' +
      '<small class="muted">Bundled with the site for trying the tools without a connection to the weather service.</small></div>' +
      (ds ? '<div class="loaded-note">Currently loaded: <strong>' + App.esc(ds.meta.city) + '</strong> · <a href="#/summary">open summary →</a></div>' : "") +
      "</div></div>";
  }

  function norm(s) { s = s.toLowerCase().trim(); return ALIASES[s] || s; }
  function dist(a, b) {
    const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  App.nearestStation = function (lat, lon) {
    if (!stations) return null;
    let best = null, bd = Infinity;
    stations.forEach(function (s) { const d = dist({ lat: lat, lon: lon }, s); if (d < bd) { bd = d; best = s; } });
    return best ? { station: best, km: bd } : null;
  };

  function results() {
    const q = norm(query);
    if (!q && !anchor) anchor = { lat: 12.30, lon: 76.64, label: "Mysuru" };
    if (q) {
      const city = App.INDIA_CITIES.find(function (c) { return norm(c.city) === q || c.city.toLowerCase() === query.toLowerCase().trim(); });
      if (city) anchor = { lat: city.lat, lon: city.lon, label: city.city };
      else {
        const hits = stations.filter(function (s) { return (s.n + " " + s.st).toLowerCase().indexOf(q) >= 0; });
        if (hits.length) {
          anchor = null;
          return hits.slice(0, 25).map(function (s) { return { s: s, d: null }; });
        }
        return [];
      }
    }
    return stations.map(function (s) { return { s: s, d: dist(anchor, s) }; })
      .sort(function (a, b) { return a.d - b.d; }).slice(0, 8);
  }

  function renderResults(root) {
    if (!stations) return;
    const list = results();
    selected = list;
    const head = anchor ? '<p class="small muted">Nearest stations to <strong>' + App.esc(anchor.label) + "</strong></p>" : "";
    App.$("#st-results", root).innerHTML = head + (list.length ? list.map(function (r, i) {
      const s = r.s;
      return '<div class="st-row"><div class="st-main"><div class="st-name">' + App.esc(s.n) + (s.st ? ' <span class="muted">· ' + App.esc(s.st) + "</span>" : "") + "</div>" +
        '<div class="st-meta">' + (r.d != null ? r.d.toFixed(0) + " km away · " : "") + s.lat.toFixed(2) + "°, " + s.lon.toFixed(2) + "°" +
        (s.el != null ? " · " + s.el.toFixed(0) + " m" : "") + (s.c1 != null ? " · design max " + s.c1 + " °C" : "") + (s.h99 != null ? " / min " + s.h99 + " °C" : "") + "</div></div>" +
        '<div class="st-act">' + (s.f.length > 1 ? '<select id="src-' + i + '" aria-label="Weather file version">' + s.f.map(function (f) {
          return '<option value="' + App.esc(f[1]) + '">' + App.esc(f[0]) + (f[2] && f[0].indexOf(f[2].replace("-", "–")) < 0 ? " · data " + f[2].replace("-", "–") : "") + "</option>";
        }).join("") + "</select>" : '<span class="small muted">' + App.esc(s.f[0][0]) + "</span>") +
        '<button class="btn primary sm" type="button" data-load="' + i + '" data-url="' + App.esc(s.f[0][1]) + '">Analyse</button>' +
        '<a class="small" href="' + App.esc(s.f[0][1]) + '" rel="noopener" title="Download the file">⤓</a></div></div>';
    }).join("") : '<p class="muted">No station matches “' + App.esc(query) + '”. Try the district or state name, or use “Near me”.</p>');
    if (App.$("#india-map", root).data) drawMap(root);
  }

  function drawMap(root) {
    const el = App.$("#india-map", root);
    const sel = (selected || []).map(function (r) { return r.s; });
    const data = [
      { type: "scattergeo", lat: stations.map(function (s) { return s.lat; }), lon: stations.map(function (s) { return s.lon; }),
        text: stations.map(function (s) { return s.n + (s.st ? ", " + s.st : ""); }), mode: "markers", name: "Weather stations",
        marker: { size: 5, color: "#173a2a", opacity: 0.45 }, hovertemplate: "%{text}<extra></extra>" },
      { type: "scattergeo", lat: sel.map(function (s) { return s.lat; }), lon: sel.map(function (s) { return s.lon; }),
        text: sel.map(function (s) { return s.n; }), mode: "markers", name: "Results",
        marker: { size: 11, color: "#2f7d4f", line: { color: "#fff", width: 1.2 } }, hovertemplate: "%{text}<extra>result</extra>" },
    ];
    if (anchor) data.push({ type: "scattergeo", lat: [anchor.lat], lon: [anchor.lon], text: [anchor.label], mode: "markers", name: anchor.label,
      marker: { size: 14, symbol: "star", color: "#c92a42", line: { color: "#fff", width: 1 } }, hovertemplate: "%{text}<extra></extra>" });
    App.Ch.render(el, { data: data, layout: {
      height: 460, margin: { l: 0, r: 0, t: 10, b: 10 }, showlegend: false,
      geo: { scope: "asia", resolution: 50, showcountries: false, showcoastlines: true, coastlinecolor: "#9a9188",
        showland: true, landcolor: "#f4efe8", showocean: true, oceancolor: "#e3eef3", showlakes: false, bgcolor: "rgba(0,0,0,0)",
        lataxis: { range: [6, 37] }, lonaxis: { range: [67, 98] }, projection: { type: "mercator" } } } }, "india_stations");
    if (!el.dataset.bound) {
      el.dataset.bound = "1";
      el.on("plotly_click", function (ev) {
        const p = ev.points && ev.points[0];
        if (!p) return;
        anchor = { lat: p.lat, lon: p.lon, label: p.text };
        query = ""; App.$("#st-search", root).value = "";
        renderResults(root);
      });
    }
  }

})(window.App);
