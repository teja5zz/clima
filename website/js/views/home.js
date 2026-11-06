/* Home: the landing page. Hero, why, benefits, tagline, how it works, the station finder,
   methods, tools, FAQ and a final call to action. */
(function (App) {
  "use strict";
  const S = App.S;

  const TOOLS = [
    ["vastu", "Vastu × Science planner", "Draw your plot, pick 1 to 4 BHK rooms and get a layout placed by Vastu and your site's sun, heat and wind. Refine it with live scores and print a report.", "compass"],
    ["summary", "Climate summary", "Location, monthly statistics, degree days and climate profiles at a glance.", "chart-bar"],
    ["india", "Climate zone and IMAC comfort", "Automatic NBC 2016 and ECBC climate zone, and the India Model for Adaptive Comfort.", "map-trifold"],
    ["strategies", "Design strategy advisor", "Passive design moves ranked for your site's climate data.", "lightbulb"],
    ["temperature", "Temperature and humidity", "Annual, daily and hourly profiles with adaptive comfort bands.", "thermometer-simple"],
    ["sun", "Sun and clouds", "Sun path diagrams, solar radiation and sky cover.", "cloud-sun"],
    ["shading", "Shading designer", "Size chajjas, overhangs and fins for any wall orientation.", "sun-horizon"],
    ["wind", "Wind", "Annual, monsoon and day and night wind roses.", "wind"],
    ["psychro", "Psychrometric chart", "Every hour of the year plotted with a comfort zone overlay.", "drop"],
    ["ventilation", "Natural ventilation", "Hours suitable for opening windows, with a condensation check.", "arrows-left-right"],
    ["outdoor", "Outdoor comfort and heat stress", "UTCI in sun, shade and wind, and heat index risk.", "umbrella"],
    ["envelope", "Envelope and ENS calculator", "Wall and roof U values with Indian materials, and Eco Niwas Samhita RETV checks.", "wall"],
    ["explorer", "Data explorer", "Any variable as a heatmap, profile or scatter, with filters and CSV export.", "chart-scatter"],
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

  const FAQ = [
    ["Is it free?", "Yes. Every tool on the site is free and needs no account or sign up."],
    ["Is my plan or drawing uploaded anywhere?", "No. Plans, drawings and weather files are processed in your browser and saved only on your device. Station weather files are downloaded from this site."],
    ["Which places does it cover?", "Over 400 Indian weather stations, from ISHRAE, Climate.OneBuilding.org and EnergyPlus weather files. You can also load any EPW weather file for a site elsewhere."],
    ["How does it give an opinion on my own drawing?", "Upload a photo, scan or screenshot of the plan. The planner finds the closed rooms, reads the room names and sizes written on it, and places the plan on your plot at its true size. You check the room types, then the Review tab lists which rooms to swap or move for Vastu, what already works, and what to do inside rooms that stay. Reading happens in your browser; the drawing is never uploaded."],
    ["Do Vastu and climate advice ever disagree?", "Sometimes. A west bedroom can suit Vastu and still be the hottest room in the house. The planner shows both scores, lets you set the balance between them, and flags changes that cost comfort."],
    ["Which Vastu rules does it follow?", "Eight 45° zones around the plot centre plus the Brahmasthan, from the Vastu Wheel for Residential Plans by Tejas Constructions. Every room type has preferred, acceptable and avoid zones."],
    ["Can it replace an architect or engineer?", "No. It is for early design and for a better conversation with your designer. Have the final drawings, structure and services checked by a qualified professional. trikrt offers that service."],
    ["Does it work on a phone?", "Yes. Pinch to zoom, drag rooms with a finger, and the planner panel slides up from the bottom of the screen."],
  ];

  App.views.home = {
    landing: true,
    title: "Vastu home planner for Indian climates · trikrt",
    html: function () {
      const b = window.BRAND;
      const ds = App.state.ds;
      const cta = '<a class="btn light lg" href="#/vastu">Start your free plan</a>';
      return '<section class="lp-hero" aria-labelledby="hero-h"><div class="lp-in"><div>' +
        '<img class="hero-word" src="' + App.esc(b.wordmarkLight || "") + '" alt="' + App.esc(b.company) + '" width="196" height="104">' +
        '<h1 id="hero-h" class="hero-h heading-1">Plan a Vastu home<br>that stays cool<br>in your city</h1>' +
        '<p class="hero-sub title-2">Draw your plot, add rooms or upload your own drawing, and see where every room belongs by Vastu and by the sun, heat and breeze at your site.</p>' +
        '<div class="hero-cta">' + cta + '<p class="hero-risk caption-2">Free, no sign up. Your plan stays on your device.</p></div>' +
        '<ul class="hero-proof caption-1"><li>' + App.icon("map-pin") + "Weather for over 400 Indian stations</li><li>" + App.icon("seal-check") + "Built on UC Berkeley's CBE Clima Tool</li></ul></div>" +
        '<figure class="hero-shot"><img src="img/planner-shot.jpg" width="1280" height="800" alt="The planner showing a 3 BHK plan on a 40 by 60 foot plot, with Vastu zones and the plan review panel listing a swap of the kitchen and living room."></figure>' +
        "</div></section>" +

        '<section class="lp-sec" aria-labelledby="why-h"><div class="lp-in lp-split" data-reveal><div class="lp-head"><p class="eyebrow">Why trikrt</p>' +
        '<h2 id="why-h">Vastu charts ignore the sun.<br>Climate tools ignore Vastu.</h2>' +
        "<p>A west bedroom in Chennai faces the 4 pm sun whatever the chart says, and a kitchen placed only for airflow can land in the north east. trikrt checks both on the same drawing, so you see where they agree and what to do where they do not.</p></div>" +
        '<div class="compare"><div class="compare-card"><h3>A Vastu chart alone</h3><ul><li>Gives zones, not sizes or windows</li><li>Same advice for Jaipur and Kochi</li><li>No check of your actual drawing</li></ul></div>' +
        '<div class="compare-card win"><h3>' + App.icon("check") + "With the trikrt planner</h3><ul><li>Every room scored by zone and by the walls it touches</li><li>Windows, shading, walls and roof sized from your city's weather</li><li>A review of your drawing with swaps ranked by gain</li></ul></div></div></div></section>" +

        '<section class="lp-sec alt" aria-labelledby="ben-h"><div class="lp-in" data-reveal><div class="lp-head"><p class="eyebrow">What you get</p><h2 id="ben-h">Everything a plot needs before the drawings</h2></div>' +
        '<div class="benefits">' +
        benefit("compass", "Every room in its right zone", "Rooms are scored by Vastu zone and by the outside walls they touch. Auto arrange places a 1 to 4 BHK on your plot in one click.") +
        benefit("seal-check", "An opinion on your own drawing", "Upload a photo or scan of your plan. The planner finds the rooms, reads their names and sizes, and reviews it: which rooms to swap, what already works, and what to do if a room stays. <a href=\"#/vastu?import=1\">Analyse my plan</a>") +
        benefit("sun-horizon", "Windows and shading for your site", "Chajja depth for each wall from real sun angles, window sizes, and inlet and outlet positions for cross ventilation.") +
        benefit("thermometer-hot", "Walls and a roof that keep heat out", "Wall build up for each side and roof options ranked by effect and cost, checked against Eco Niwas Samhita 2018.") +
        "</div></div></section>" +

        '<section class="lp-tag" aria-label="Our approach"><p data-words>' + App.esc(b.motto || "Build with the sun, the wind and the land") + ".</p>" +
        '<small class="caption-2">Every placement in the planner is tested against the zone it sits in and the weather it will live in.</small></section>' +

        '<section class="lp-sec" aria-labelledby="how-h"><div class="lp-in" data-reveal><div class="lp-head"><p class="eyebrow">How it works</p><h2 id="how-h">From plot to plan in three steps</h2></div>' +
        '<ol class="steps3"><li><h3>Set your plot and city</h3><p>Plot size in feet or metres, the road facing, setbacks, and the nearest of over 400 weather stations.</p></li>' +
        "<li><h3>Add rooms or upload your drawing</h3><p>Pick a house type and let it arrange, or upload the plan you already have and let the planner find and name its rooms.</p></li>" +
        "<li><h3>Read the review and print</h3><p>Swaps and moves ranked by gain, cooling strategies drawn on the plan, and a report for your builder.</p></li></ol>" +
        '<div class="btn-row">' + '<a class="btn primary" href="#/vastu">Start your free plan</a></div></div></section>' +

        '<section class="lp-sec alt" id="stations" aria-labelledby="st-h"><div class="lp-in"><div class="lp-head"><p class="eyebrow">Climate tools</p><h2 id="st-h">Check your site\'s climate</h2>' +
        "<p>Search a city, district or state, or use your location, and press Analyse. The planner and every climate tool then use that weather file.</p></div>" +
        '<div class="lp-card">' + stationFinder() + "</div>" +
        '<details class="acc lp-own"><summary>Use your own weather file</summary>' + loader(ds) + "</details></div></section>" +

        '<section class="lp-sec" aria-labelledby="proof-h"><div class="lp-in" data-reveal><div class="lp-head"><p class="eyebrow">Methods you can check</p><h2 id="proof-h">Built on published standards, not rules of thumb</h2>' +
        '<p>Every number on the site comes from a method you can look up. <a href="#/learn">Read the methods</a>.</p></div><div class="proof">' +
        proof("NBC 2016", "Climate zones, minimum room sizes and window areas from the National Building Code of India.") +
        proof("Eco Niwas Samhita 2018", "Roof U value limit and openable window area for homes.") +
        proof("IMAC comfort model", "Comfort ranges measured in Indian homes, wider than imported defaults.") +
        proof("CBE Clima Tool", "Climate engine from UC Berkeley, published in Building Simulation (2023).") +
        '</div><div class="maker"><p><b>' + App.esc(b.owner || "") + "</b> leads trikrt in Mysuru. " +
        "Need drawings, structural design or a turnkey build? trikrt offers those services.</p>" +
        (b.phone ? '<a class="btn light" href="tel:' + App.esc(b.phone.replace(/\s+/g, "")) + '">' + App.icon("phone") + "Call " + App.esc(b.phone) + "</a>" : "") + "</div></div></section>" +

        '<section class="lp-sec alt" aria-labelledby="tools-h"><div class="lp-in" data-reveal><div class="lp-head"><p class="eyebrow">More tools</p><h2 id="tools-h">Thirteen tools for your site\'s climate</h2></div><div class="tool-grid">' +
        TOOLS.map(function (t, i) {
          return '<a class="tool' + (i === 0 ? " tool-feature" : "") + '" href="#/' + t[0] + '">' + App.icon(t[3]) + "<h3>" + t[1] + "</h3><p>" + t[2] + "</p></a>";
        }).join("") + "</div></div></section>" +

        '<section class="lp-sec" aria-labelledby="faq-h"><div class="lp-in" data-reveal><div class="lp-head"><p class="eyebrow">Questions</p><h2 id="faq-h">Before you start</h2></div><div class="faq">' +
        FAQ.map(function (q) { return "<details><summary>" + q[0] + App.icon("caret-down") + "</summary><p>" + q[1] + "</p></details>"; }).join("") + "</div></div></section>" +

        '<section class="lp-final" aria-labelledby="final-h"><h2 id="final-h" class="hero-h heading-2">Plan a Vastu home<br>that stays cool<br>in your city</h2>' +
        '<p class="hero-sub title-2">Free, no sign up. Your plan stays on your device.</p><div class="hero-cta">' + cta + "</div></section>";
    },
    mount: function (root) {
      words(root);
      const ld = document.getElementById("faq-ld");
      if (ld && !ld.textContent) ld.textContent = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: FAQ.map(function (q) { return { "@type": "Question", name: q[0], acceptedAnswer: { "@type": "Answer", text: q[1] } }; }) });
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

  function benefit(icon, title, text) {
    return '<div class="benefit"><div class="benefit-ic">' + App.icon(icon) + "</div><h3>" + title + "</h3><p>" + text + "</p></div>";
  }
  function proof(title, text) {
    return '<div class="proof-item">' + App.icon("seal-check") + "<div><b>" + title + "</b><span>" + text + "</span></div></div>";
  }

  // Tagline reveal: each word moves from a muted tone to full colour as it crosses a line
  // 40 % up from the bottom of the screen.
  function words(root) {
    const p = App.$("[data-words]", root);
    if (!p) return;
    p.innerHTML = p.textContent.split(/\s+/).map(function (w) { return '<span class="w">' + App.esc(w) + "</span>"; }).join(" ");
    const ws = App.$$(".w", p);
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) { ws.forEach(function (w) { w.classList.add("on"); }); return; }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -40% 0px" });
    ws.forEach(function (w) { io.observe(w); });
  }

  function stationFinder() {
    return '<div class="finder"><div class="finder-left">' +
      '<div class="pair finder-search"><input id="st-search" type="search" placeholder="City, district or state, for example Mysuru" aria-label="Search weather stations">' +
      '<button id="st-near" class="btn" type="button">' + App.icon("crosshair") + 'Near me</button></div>' +
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
      '<div class="drop-icon">' + App.icon("upload-simple") + '</div><strong>Drop an .epw or .zip file here</strong><span>or click to browse</span>' +
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
