/* Vastu × Science planner: a rotatable Vastu wheel over the user's plan, with sun path,
   façade heat and seasonal wind overlays, and room-by-room placement scores that blend
   Vastu guidance with the site's climate data. */
(function (App) {
  "use strict";
  const S = App.S;
  const D2R = Math.PI / 180;
  const Z = App.VASTU_ZONES;

  const sel = {
    weight: 50, theta: 0, img: null, opacity: 0.85, scale: 1, zone: "NE",
    sun: true, wind: true, heat: true,
    rooms: new Set(App.VASTU_ROOMS.filter(function (r) { return r.def; }).map(function (r) { return r.id; })),
  };

  const MITIGATION = {
    bedroom: "Keep it cool: thick (230 mm+) or insulated walls on the sunny sides, small high windows on W/SW with deep chajjas or jaalis, an insulated or cool roof, and a wardrobe or toilet along the west wall as a buffer. Shade trees on the south-west help most.",
    living: "Add a deep verandah or chajja on the hot sides, operable windows facing the breeze, and light-coloured finishes; ceiling fans widen the comfortable range.",
    kitchen: "Provide a chimney / exhaust fan and cross-ventilation, and shade any west-facing window with a chajja or louvres.",
    pooja: "Bring in morning light with an east clerestory window or skylight.",
    study: "Use north-facing or high-level windows and external shading to avoid glare on screens.",
    dining: "Shade west windows and keep a ceiling fan; place the dining table away from the hottest wall.",
    entrance: "Provide a shaded porch or verandah; if the door cannot face the breeze, add ventilators or windows on the windward side.",
    buffer: "Service rooms here are fine; just keep windows facing the breeze for the main rooms.",
    open: "Keep a courtyard or opening on the breeze side and plant shade trees on the west and south-west.",
    roofshade: "If the tank sits elsewhere, shade the west roof with a pergola, solar panels or a cool-roof coating.",
    solar: "Panels perform best tilted at about the site latitude facing south; roof-mounted frames can face south whatever the room below.",
  };

  App.views.vastu = {
    html: function () {
      const ds = App.state.ds;
      return App.pageHead("Vastu × Science planner", "Place every room with your Vastu wheel and this site's real sun, heat and wind. Rotate the wheel to match the north arrow on your plan.") +
        (ds ? "" : '<div class="note warn-note">Showing Vastu guidance only. <a href="#/home">Choose your city</a> to add sun, heat and wind scores for your site.</div>') +
        '<div class="vastu-grid">' +
        '<section class="card wheel-card"><div class="wheel-tools">' +
        '<div class="field"><label for="vz-theta">North arrow on your plan points to <output id="vz-theta-out">' + sel.theta + '°</output></label>' +
        '<input id="vz-theta" type="range" min="0" max="359" step="1" value="' + sel.theta + '" aria-describedby="vz-theta-help">' +
        '<small id="vz-theta-help" class="muted">Clockwise from the top of the drawing. Up = 0°, right = 90°.</small></div>' +
        '<div class="field"><label for="vz-img">Your plan (image)</label><input id="vz-img" type="file" accept="image/*"><small class="muted">Stays on your device.</small></div>' +
        '<div class="field"><label for="vz-scale">Wheel size</label><input id="vz-scale" type="range" min="0.5" max="1.6" step="0.05" value="' + sel.scale + '"></div>' +
        '<div class="field"><label for="vz-op">Wheel opacity</label><input id="vz-op" type="range" min="0.2" max="1" step="0.05" value="' + sel.opacity + '"></div>' +
        '<div class="field checks"><label class="check"><input id="vz-sun" type="checkbox"' + (sel.sun ? " checked" : "") + (ds ? "" : " disabled") + '> Sun paths</label>' +
        '<label class="check"><input id="vz-heat" type="checkbox"' + (sel.heat ? " checked" : "") + (ds ? "" : " disabled") + '> Afternoon heat ring</label>' +
        '<label class="check"><input id="vz-wind" type="checkbox"' + (sel.wind ? " checked" : "") + (ds ? "" : " disabled") + "> Seasonal winds</label></div></div>" +
        '<div id="vz-wheel" class="wheel-wrap"></div><div id="vz-legend" class="wheel-legend"></div></section>' +
        '<section class="card zone-card" id="vz-zone"></section></div>' +

        App.card("Rooms to place", '<div class="toolbar"><div class="field grow"><label for="vz-weight">Balance: <output id="vz-w-out"></output></label>' +
          '<input id="vz-weight" type="range" min="0" max="100" step="5" value="' + sel.weight + '"' + (ds ? "" : " disabled") + '>' +
          '<div class="range-ends"><span>Building science</span><span>Vastu</span></div></div></div>' +
          '<div class="room-chips">' + App.VASTU_ROOMS.map(function (r) {
            return '<label class="chip-check"><input type="checkbox" data-room="' + r.id + '"' + (sel.rooms.has(r.id) ? " checked" : "") + "><span>" + r.label + "</span></label>";
          }).join("") + "</div>" +
          '<div id="vz-table"></div>' +
          '<div class="layout-row"><div><h3>Suggested layout</h3><div id="vz-layout"></div></div>' +
          '<div class="layout-notes"><h3>How to read it</h3><p class="small">Each room goes to the zone with its highest combined score (shown), with at most two or three rooms per zone and the centre kept open as the Brahmasthan — which also helps daylight and stack ventilation in deep plans.</p>' +
          '<p class="small">The grid is drawn with true north up. Drag the balance slider towards Vastu or building science to see how the layout changes, then sketch the final plan with your architect.</p>' +
          '<div class="btn-row"><button class="btn" id="vz-print" type="button">Print / save as PDF</button><button class="btn ghost" id="vz-share" type="button">Copy share link</button></div></div></div>') +

        (ds ? App.card("Climate by direction — " + App.esc(ds.meta.city), '<div id="vz-dirtable"></div>', { lead: "What each façade experiences in a typical year at this site. Use it to check any placement." }) : "") +

        App.card("Important notes", '<ul class="tips small">' + App.VASTU_NOTES.map(function (n) { return "<li>" + App.esc(n) + "</li>"; }).join("") +
          "<li>Science scores use this site's weather file: façade solar gain in overheating hours (IMAC band), morning sun, afternoon heat, prevailing breeze when it is warm, night breeze, and heating vs cooling need from degree-days.</li></ul>");
    },
    mount: function (root) {
      const ds = App.state.ds;
      const metrics = ds ? App.siteMetrics(ds) : null;
      const redrawAll = function () { drawWheel(root, ds, metrics); drawZone(root, ds, metrics); drawRooms(root, ds, metrics); };
      const bind = function (id, ev, fn) { App.$(id, root).addEventListener(ev, fn); };
      bind("#vz-theta", "input", function (e) { sel.theta = +e.target.value; App.$("#vz-theta-out", root).textContent = sel.theta + "°"; drawWheel(root, ds, metrics); });
      bind("#vz-scale", "input", function (e) { sel.scale = +e.target.value; drawWheel(root, ds, metrics); });
      bind("#vz-op", "input", function (e) { sel.opacity = +e.target.value; drawWheel(root, ds, metrics); });
      ["sun", "heat", "wind"].forEach(function (k) { bind("#vz-" + k, "change", function (e) { sel[k] = e.target.checked; drawWheel(root, ds, metrics); }); });
      bind("#vz-img", "change", function (e) {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = function () { sel.img = r.result; if (sel.opacity > 0.6) { sel.opacity = 0.55; App.$("#vz-op", root).value = 0.55; } drawWheel(root, ds, metrics); };
        r.readAsDataURL(f);
      });
      bind("#vz-weight", "input", function (e) { sel.weight = +e.target.value; drawRooms(root, ds, metrics); drawWheel(root, ds, metrics); drawZone(root, ds, metrics); });
      App.$$("[data-room]", root).forEach(function (c) {
        c.addEventListener("change", function () { if (c.checked) sel.rooms.add(c.dataset.room); else sel.rooms.delete(c.dataset.room); drawRooms(root, ds, metrics); drawWheel(root, ds, metrics); });
      });
      App.$("#vz-wheel", root).addEventListener("click", function (e) {
        const t = e.target.closest("[data-zone]");
        if (t) { sel.zone = t.dataset.zone; drawZone(root, ds, metrics); drawWheel(root, ds, metrics); }
      });
      App.$("#vz-wheel", root).addEventListener("keydown", function (e) {
        const t = e.target.closest("[data-zone]");
        if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sel.zone = t.dataset.zone; drawZone(root, ds, metrics); drawWheel(root, ds, metrics); }
      });
      bind("#vz-print", "click", function () { window.print(); });
      bind("#vz-share", "click", function () {
        const link = App.shareLink();
        (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { App.toast("Link copied — it opens this location's analysis.", "ok"); },
          function () { window.prompt("Copy this link:", link); });
      });
      if (metrics) App.$("#vz-dirtable", root).innerHTML = dirTable(metrics);
      redrawAll();
    },
  };

  /* ---------- scoring ---------- */
  function scorer(ds, metrics) {
    const w = ds ? sel.weight / 100 : 1;
    const cache = {};
    return function (room, k) {
      const v = App.vastuScore(room, Z[k].id);
      if (!metrics) return v;
      if (!(room.sci in cache)) cache[room.sci] = App.scienceScores(metrics, room.sci);
      const sc = cache[room.sci];
      return sc ? w * v + (1 - w) * sc.score[k] : v;
    };
  }

  function selectedRooms() { return App.VASTU_ROOMS.filter(function (r) { return sel.rooms.has(r.id); }); }

  /* ---------- wheel ---------- */
  function polar(r, azDeg) { const a = (azDeg - 90) * D2R; return [r * Math.cos(a), r * Math.sin(a)]; }
  function arc(r0, r1, a0, a1) {
    const p0 = polar(r1, a0), p1 = polar(r1, a1), p2 = polar(r0, a1), p3 = polar(r0, a0);
    const large = a1 - a0 > 180 ? 1 : 0;
    return "M" + p0[0].toFixed(1) + " " + p0[1].toFixed(1) + " A" + r1 + " " + r1 + " 0 " + large + " 1 " + p1[0].toFixed(1) + " " + p1[1].toFixed(1) +
      " L" + p2[0].toFixed(1) + " " + p2[1].toFixed(1) + " A" + r0 + " " + r0 + " 0 " + large + " 0 " + p3[0].toFixed(1) + " " + p3[1].toFixed(1) + "Z";
  }
  function label(x, y, text, cls, size) {
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" transform="rotate(' + (-sel.theta) + " " + x.toFixed(1) + " " + y.toFixed(1) + ')" class="' + (cls || "") + '"' +
      (size ? ' font-size="' + size + '"' : "") + ' text-anchor="middle" dominant-baseline="middle">' + App.esc(text) + "</text>";
  }

  function drawWheel(root, ds, metrics) {
    const R0 = 92, R1 = 118, R2 = 250, R3 = 292;
    const layout = App.assignRooms(selectedRooms(), scorer(ds, metrics));
    let g = "";
    // degree ticks
    for (let a = 0; a < 360; a += 10) {
      const p = polar(R3, a), q = polar(R3 + (a % 30 === 0 ? 10 : 5), a);
      g += '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '" class="tick"/>';
      if (a % 30 === 0) { const t = polar(R3 + 22, a); g += label(t[0], t[1], a + "°", "deg", 11); }
    }
    Z.forEach(function (z) {
      const a0 = z.az - 22.5, a1 = z.az + 22.5, active = sel.zone === z.id;
      g += '<g data-zone="' + z.id + '" tabindex="0" role="button" aria-label="' + z.name + ' zone" class="zone' + (active ? " active" : "") + '">' +
        '<path d="' + arc(R2, R3, a0, a1) + '" fill="' + z.color + '" class="ring"/>' +
        '<path d="' + arc(R1, R2, a0, a1) + '" fill="' + z.color + '" fill-opacity="0.28" class="sector"/>' +
        '<path d="' + arc(R0, R1, a0, a1) + '" fill="' + z.color + '" fill-opacity="0.55"/>';
      const t = polar((R2 + R3) / 2 - 7, z.az), u = polar((R2 + R3) / 2 + 12, z.az);
      g += label(t[0], t[1], z.name.toUpperCase(), "zname", 16) + label(u[0], u[1], "(" + z.deity + ")", "zdeity", 12.5);
      const e = polar((R0 + R1) / 2, z.az);
      g += label(e[0], e[1], z.element.toUpperCase(), "zel", 9.5);
      const placed = (layout[z.id] || []).map(function (x) { return x.room.label.replace(" / bathrooms", "").replace(" / home office", "").replace(" / heavy storage", ""); });
      const lines = placed.length ? placed : z.uses;
      const shown = lines.slice(0, 4), c = polar(R1 + 66, z.az);
      shown.forEach(function (txt, i) {
        const y = c[1] + (i - (shown.length - 1) / 2) * 19;
        g += '<text x="' + c[0].toFixed(1) + '" y="' + y.toFixed(1) + '" transform="rotate(' + (-sel.theta) + " " + c[0].toFixed(1) + " " + c[1].toFixed(1) + ')" class="' + (placed.length ? "zroom placed" : "zroom") + '" text-anchor="middle" dominant-baseline="middle">' + App.esc(txt) + "</text>";
      });
      g += "</g>";
    });
    // centre
    g += '<circle r="' + R0 + '" class="centre"/><circle r="' + (R0 - 30) + '" class="centre-inner"/>';
    g += label(0, -6, "Brahmasthan", "zcentre", 12) + label(0, 10, "keep open", "zdeity", 10);
    [["N", 0], ["E", 90], ["S", 180], ["W", 270]].forEach(function (c) { const p = polar(R0 - 14, c[1]); g += label(p[0], p[1], c[0], "compass", 12); });

    let over = "";
    if (metrics && sel.heat) {
      const h = metrics.norm.pmHotSun;
      Z.forEach(function (z, k) {
        over += '<path d="' + arc(R3 + 30, R3 + 40, z.az - 22.5, z.az + 22.5) + '" fill="#d9480f" fill-opacity="' + (0.08 + 0.8 * h[k]).toFixed(2) + '"><title>' + z.name +
          ": afternoon sun in hot hours " + metrics.raw.pmHotSun[k].toFixed(0) + " kWh/m² per year</title></path>";
      });
    }
    if (ds && sel.sun) over += sunPaths(ds, R2);
    if (ds && sel.wind) over += winds(ds, R3);

    const size = 720;
    let img = "";
    if (sel.img) img = '<image href="' + sel.img + '" x="' + (-size / 2) + '" y="' + (-size / 2) + '" width="' + size + '" height="' + size + '" preserveAspectRatio="xMidYMid meet"/>';
    const svg = '<svg viewBox="' + (-size / 2) + " " + (-size / 2) + " " + size + " " + size + '" class="wheel" role="img" aria-label="Vastu wheel rotated ' + sel.theta + ' degrees">' +
      img + '<g transform="rotate(' + sel.theta + ") scale(" + sel.scale + ')" opacity="' + sel.opacity + '">' + g + over + "</g>" +
      '<g class="plan-north" transform="translate(' + (size / 2 - 40) + " " + (-size / 2 + 50) + ')"><polygon points="0,-26 9,6 0,0 -9,6" transform="rotate(' + sel.theta + ')"/><text y="26" text-anchor="middle">N</text></g></svg>';
    App.$("#vz-wheel", root).innerHTML = svg;
    App.$("#vz-legend", root).innerHTML = metrics ? (
      (sel.sun ? '<span><i class="lg sun"></i>Sun path: 21 Jun (outer), 21 Mar/Sep, 21 Dec; dots every 2 h</span>' : "") +
      (sel.heat ? '<span><i class="lg heat"></i>Afternoon heat on façades in hot hours (darker = hotter)</span>' : "") +
      (sel.wind ? '<span><i class="lg wind"></i>Prevailing warm-weather wind by season (arrow width = frequency)</span>' : "")) :
      '<span class="muted">Load a weather file to overlay the sun path, façade heat and winds.</span>';
  }

  function sunPaths(ds, R) {
    const m = ds.meta;
    let s = "";
    [[6, 21, "#e8590c", 2.2], [3, 21, "#f59f00", 1.6], [12, 21, "#fab005", 1.6]].forEach(function (d) {
      const doy = S.doyOf(d[0], d[1]);
      const pts = [], dots = [];
      for (let t = 0; t <= 24; t += 0.1) {
        const p = S.solarPosition(doy, t, m.lat, m.lon, m.tz);
        if (p.apparentElevation <= 0) continue;
        const xy = polar(R * (90 - p.apparentElevation) / 90, p.azimuth);
        pts.push(xy[0].toFixed(1) + "," + xy[1].toFixed(1));
        if (Math.abs(t / 2 - Math.round(t / 2)) < 0.026) dots.push(xy);
      }
      s += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + d[2] + '" stroke-width="' + d[3] + '" stroke-dasharray="6 4"/>';
      dots.forEach(function (xy) { s += '<circle cx="' + xy[0].toFixed(1) + '" cy="' + xy[1].toFixed(1) + '" r="3.5" fill="' + d[2] + '"/>'; });
    });
    return s;
  }

  const SEASONS = [["Summer (Mar–May)", 3, 5, "#d9480f"], ["Monsoon (Jun–Sep)", 6, 9, "#1c7ed6"], ["Winter (Nov–Feb)", 11, 2, "#5f3dc4"]];
  function prevailing(ds, m0, m1) {
    const c = new Array(16).fill(0); let n = 0;
    const mask = App.Ch.mask(ds, { m0: m0, m1: m1 });
    for (let i = 0; i < ds.n; i++) {
      if (!mask[i] || ds.d.wind_speed[i] < 1) continue;
      c[Math.round(((ds.d.wind_dir[i] % 360) + 360) % 360 / 22.5) % 16]++; n++;
    }
    const k = c.indexOf(Math.max.apply(null, c));
    return n ? { az: k * 22.5, share: c[k] / n } : null;
  }
  function winds(ds, R) {
    let s = "";
    SEASONS.forEach(function (se, i) {
      const p = prevailing(ds, se[1], se[2]);
      if (!p) return;
      const a = polar(R + 75 + i * 4, p.az), b = polar(R + 8, p.az);
      const w = 3 + 14 * p.share;
      s += '<g><title>' + se[0] + ": mostly from " + p.az + "° (" + (100 * p.share).toFixed(0) + '% of windy hours)</title><line x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) +
        '" stroke="' + se[3] + '" stroke-width="' + w.toFixed(1) + '" stroke-linecap="round" marker-end="url(#ah' + i + ')" opacity="0.85"/></g>';
      s += '<defs><marker id="ah' + i + '" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="' + se[3] + '"/></marker></defs>';
    });
    return s;
  }

  /* ---------- zone panel ---------- */
  function drawZone(root, ds, metrics) {
    const k = Z.findIndex(function (z) { return z.id === sel.zone; });
    const z = Z[k];
    const score = scorer(ds, metrics);
    const ranked = App.VASTU_ROOMS.map(function (r) { return { r: r, s: score(r, k), v: App.vastuVerdict(r, z.id) }; })
      .sort(function (a, b) { return b.s - a.s; });
    let html = '<div class="zone-head" style="--z:' + z.color + '"><h2>' + z.name + ' <span class="muted">(' + z.deity + ")</span></h2>" +
      '<p class="small">' + (z.az - 22.5 + 360) % 360 + "° – " + (z.az + 22.5) + "° · Element: <strong>" + z.element + "</strong> · " + z.theme + "</p></div>" +
      '<p class="small"><strong>Vastu uses:</strong> ' + z.uses.join(", ") + '<br><strong>Avoid:</strong> ' + z.avoid + "</p>";
    if (metrics) {
      const r = metrics.raw;
      html += '<div class="stats mini">' +
        App.stat("Afternoon heat (hot hours)", r.pmHotSun[k].toFixed(0) + " kWh/m²") +
        App.stat("Morning sun (6–10 h)", r.amSun[k].toFixed(0) + " kWh/m²") +
        App.stat("Breeze from here", (100 * r.breeze[k]).toFixed(0) + " %", "of warm hours") +
        App.stat("Winter sun", r.coldSun[k].toFixed(0) + " kWh/m²", "in cool hours") + "</div>";
    }
    html += "<h3>Best rooms here" + (metrics ? " (Vastu + science)" : "") + "</h3><ol class=\"zone-rank\">" + ranked.slice(0, 5).map(function (x) {
      return "<li><span>" + x.r.label + '</span><span class="tag ' + x.v.toLowerCase() + '">' + x.v + "</span><b>" + Math.round(100 * x.s) + "</b></li>";
    }).join("") + "</ol>";
    const avoid = ranked.filter(function (x) { return x.v === "Avoid"; }).map(function (x) { return x.r.label; });
    if (avoid.length) html += '<p class="small"><strong>Vastu discourages here:</strong> ' + avoid.join(", ") + "</p>";
    App.$("#vz-zone", root).innerHTML = html;
  }

  /* ---------- rooms table and layout ---------- */
  function drawRooms(root, ds, metrics) {
    const w = sel.weight;
    App.$("#vz-w-out", root).textContent = ds ? (w === 50 ? "equal weight" : w > 50 ? w + " % Vastu" : (100 - w) + " % science") : "Vastu only";
    const rooms = selectedRooms();
    const score = scorer(ds, metrics);
    let html = '<div class="table-wrap"><table class="vz-table"><thead><tr><th>Room</th><th>Best directions</th><th>Vastu</th>' + (metrics ? "<th>Climate says</th><th>Verdict</th>" : "") + "</tr></thead><tbody>";
    rooms.forEach(function (r) {
      const sc = metrics ? App.scienceScores(metrics, r.sci) : null;
      const order = Z.map(function (z, k) { return { z: z, k: k, s: score(r, k) }; }).sort(function (a, b) { return b.s - a.s; });
      const top = order.slice(0, 3).map(function (o) {
        return '<span class="dir-chip" style="--z:' + o.z.color + '">' + o.z.id + " <b>" + Math.round(100 * o.s) + "</b></span>";
      }).join("");
      let climate = "", verdict = "";
      if (sc) {
        const sOrder = sc.score.map(function (v, k) { return [v, k]; }).sort(function (a, b) { return b[0] - a[0]; });
        const best = sOrder[0][1];
        const vk = Z.findIndex(function (z) { return z.id === r.pref[0]; });
        climate = "<strong>" + Z[best].id + "</strong> — " + App.esc(sc.why[best]);
        const vSci = sc.score[vk];
        const topSci = sOrder.slice(0, 3).map(function (x) { return x[1]; });
        if (topSci.indexOf(vk) >= 0 || r.pref.some(function (p) { return Z.findIndex(function (z) { return z.id === p; }) === best; })) {
          verdict = '<span class="agree">✓ Vastu and climate agree</span>';
        } else if (vSci < 0.4) {
          verdict = '<span class="conflict">⚠ Conflict in ' + r.pref[0] + ": " + App.esc(sc.why[vk]) + '</span><div class="small muted">' + MITIGATION[r.sci] + "</div>";
        } else {
          verdict = '<span class="partial">◐ Workable in ' + r.pref[0] + "</span>";
        }
      } else if (metrics) {
        climate = '<span class="muted">No climate effect — follow site drainage, soil and bylaw setbacks.</span>';
        verdict = '<span class="muted">Vastu / site rules</span>';
      }
      html += "<tr><td><strong>" + r.label + "</strong></td><td>" + top + "</td><td>" + r.pref.join(" / ") + (r.alt.length ? '<div class="small muted">alt. ' + r.alt.join(", ") + "</div>" : "") +
        (r.avoid.length ? '<div class="small muted">avoid ' + r.avoid.join(", ") + "</div>" : "") + "</td>" + (metrics ? "<td>" + climate + "</td><td>" + verdict + "</td>" : "") + "</tr>";
    });
    html += "</tbody></table></div>";
    if (!rooms.length) html = '<p class="muted">Tick the rooms you need above.</p>';
    App.$("#vz-table", root).innerHTML = html;

    const layout = App.assignRooms(rooms, score);
    const grid = [["NW", "N", "NE"], ["W", "C", "E"], ["SW", "S", "SE"]];
    App.$("#vz-layout", root).innerHTML = '<div class="plan-grid">' + grid.flat().map(function (id) {
      if (id === "C") return '<div class="cell centre-cell"><span class="cz">Centre</span><span>Open hall / courtyard</span></div>';
      const z = Z.find(function (x) { return x.id === id; });
      const items = (layout[id] || []).map(function (x) { return "<span>" + x.room.label + " <b>" + Math.round(100 * x.score) + "</b></span>"; }).join("");
      return '<div class="cell" style="--z:' + z.color + '"><span class="cz">' + z.name + "</span>" + (items || '<span class="muted">—</span>') + "</div>";
    }).join("") + '</div><div class="plan-n">▲ N</div>';
  }

  function dirTable(m) {
    const r = m.raw;
    const row = function (label, arr, fmt) { return "<tr><th>" + label + "</th>" + arr.map(function (v) { return "<td>" + fmt(v) + "</td>"; }).join("") + "</tr>"; };
    return '<div class="table-wrap"><table class="num"><thead><tr><th></th>' + Z.map(function (z) { return '<th><span class="dir-chip" style="--z:' + z.color + '">' + z.id + "</span></th>"; }).join("") + "</tr></thead><tbody>" +
      row("Solar heat in hot hours (kWh/m²·yr)", r.hotSun, function (v) { return v.toFixed(0); }) +
      row("…of which afternoon 12–19 h", r.pmHotSun, function (v) { return v.toFixed(0); }) +
      row("Morning direct sun 6–10 h", r.amSun, function (v) { return v.toFixed(0); }) +
      row("Useful sun in cool hours", r.coldSun, function (v) { return v.toFixed(0); }) +
      row("Breeze from this side (warm hours)", r.breeze, function (v) { return (100 * v).toFixed(0) + "%"; }) +
      row("Night breeze (19–06 h)", r.nightBreeze, function (v) { return (100 * v).toFixed(0) + "%"; }) +
      row("Rooftop solar, panel facing this way (kWh/m²·yr)", r.roofSolar, function (v) { return v.toFixed(0); }) +
      "</tbody></table></div><p class=\"muted small\">Heating need share " + (100 * m.heatShare).toFixed(0) + " % (HDD 18 °C = " + m.hdd.toFixed(0) + ", CDD 24 °C = " + m.cdd.toFixed(0) + "). Solar values include direct sun and half the diffuse sky on a vertical wall.</p>";
  }
})(window.App);
