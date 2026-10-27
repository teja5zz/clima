/* Methods & guide, and About / citation pages. */
(function (App) {
  "use strict";

  App.REFERENCES = [
    ["Betti G., Tartarini F., Nguyen C., Schiavon S. (2023). CBE Clima Tool: A free and open-source web application for climate analysis tailored to sustainable building design. Building Simulation.", "https://doi.org/10.1007/s12273-023-1090-5"],
    ["CBE Clima Tool source code (MIT licence), Center for the Built Environment, University of California, Berkeley.", "https://github.com/CenterForTheBuiltEnvironment/clima"],
    ["Tartarini F., Schiavon S. (2020). pythermalcomfort: A Python package for thermal comfort research. SoftwareX 12, 100578.", "https://doi.org/10.1016/j.softx.2020.100578"],
    ["Bröde P. et al. (2012). Deriving the operational procedure for the Universal Thermal Climate Index (UTCI). International Journal of Biometeorology 56, 481–494.", "https://doi.org/10.1007/s00484-011-0454-1"],
    ["Manu S., Shukla Y., Rawal R., Thomas L.E., de Dear R. (2016). Field studies of thermal comfort across multiple climate zones for the subcontinent: India Model for Adaptive Comfort (IMAC). Building and Environment 98, 55–70.", "https://doi.org/10.1016/j.buildenv.2015.12.019"],
    ["Bureau of Indian Standards (2016). National Building Code of India 2016, Part 8 — Building Services, Section 1: Lighting and Natural Ventilation.", "https://www.bis.gov.in/"],
    ["Bureau of Energy Efficiency (2017). Energy Conservation Building Code 2017.", "https://beeindia.gov.in/"],
    ["Bureau of Energy Efficiency (2018). Eco-Niwas Samhita 2018 — Energy Conservation Building Code for Residential Buildings, Part I: Building Envelope.", "https://beeindia.gov.in/"],
    ["Bansal N.K., Minke G. (1988). Climatic Zones and Rural Housing in India. Kernforschungsanlage Jülich.", null],
    ["ANSI/ASHRAE Standard 55-2020. Thermal Environmental Conditions for Human Occupancy (adaptive model and SolarCal, Appendix C).", "https://www.ashrae.org/"],
    ["ISO 6946:2017. Building components and building elements — Thermal resistance and thermal transmittance — Calculation methods.", "https://www.iso.org/"],
    ["NOAA Global Monitoring Laboratory — Solar position calculator (algorithms after Meeus, Astronomical Algorithms).", "https://gml.noaa.gov/grad/solcalc/"],
    ["Rothfusz L.P. (1990). The Heat Index Equation. NWS Technical Attachment SR 90-23.", null],
    ["India Meteorological Department — heat wave criteria.", "https://mausam.imd.gov.in/"],
    ["Tejas Constructions. Vastu Wheel for Residential Plans (zones, elements and placement quick reference).", null],
    ["ISHRAE / U.S. DOE EnergyPlus weather data for India; station catalogue from the CBE Clima Tool.", "https://energyplus.net/weather"],
    ["Lawrie L.K., Crawley D.B. (2022). Development of Global Typical Meteorological Years (TMYx). Climate.OneBuilding.Org.", "https://climate.onebuilding.org/"],
    ["Plotly.js (MIT) — interactive charts; JSZip (MIT) — reading zipped weather files.", "https://plotly.com/javascript/"],
  ];

  App.refList = function () {
    return '<ol class="refs">' + App.REFERENCES.map(function (r) {
      return "<li>" + App.esc(r[0]) + (r[1] ? ' <a href="' + r[1] + '" target="_blank" rel="noopener">' + App.esc(r[1].replace(/^https?:\/\//, "")) + "</a>" : "") + "</li>";
    }).join("") + "</ol>";
  };

  App.views.learn = {
    html: function () {
      const sec = function (t, body) { return '<details class="acc"><summary>' + t + "</summary><div>" + body + "</div></details>"; };
      return App.pageHead("Methods & guide", "How each number on this site is calculated, and how to use it in design.") +
        App.card("Getting started", "<ol class='steps'><li>Download the EPW weather file nearest to your site (TMYx files from Climate.OneBuilding.org are free; ISHRAE files are licensed).</li>" +
          "<li>Drop the .epw or .zip on the home page. Everything is computed in your browser — nothing is uploaded.</li>" +
          "<li>Read the <a href='#/summary'>Climate summary</a> and <a href='#/india'>Climate zone</a> first, then the <a href='#/strategies'>Strategy advisor</a>.</li>" +
          "<li>Use the specialised tools — wind roses for openings, the shading designer for chajjas, the envelope calculator for walls, roofs and ENS compliance.</li>" +
          "<li>Every chart has a camera icon (hover the top-right corner) to save it as an image for reports.</li></ol>") +
        App.card("Methods", sec("Weather data", "<p>EnergyPlus Weather (EPW) files hold 8,760 hourly records of a typical year. Missing values of temperature, humidity, wind and pressure are linearly interpolated; missing radiation is set to zero. Leap-day records are dropped.</p>") +
          sec("Solar position", "<p>NOAA solar-position algorithm (after Meeus), evaluated at the middle of each hourly interval in local standard time, with atmospheric refraction. Agreement with pvlib is within 0.05°.</p>") +
          sec("NBC 2016 climate zone", "<p>Each month is classified on its mean daily maximum temperature and mean daytime (09–18 h) relative humidity: Hot-Dry (> 30 °C, RH < 55 %), Warm-Humid (> 30 °C and RH ≥ 55 %, or > 25 °C and RH > 75 %), Temperate (25–30 °C, RH ≤ 75 %), Cold (< 25 °C). The site takes the type that holds for six months or more; otherwise it is Composite. Tested on ISHRAE weather files for 12 cities with known code zones, daytime humidity reproduced 11 (24-hour humidity: 10); Jaipur, a borderline composite / hot-dry city, is the exception.</p>") +
          sec("IMAC adaptive comfort", "<p>The 30-day running mean outdoor temperature is the simple average of the daily mean temperatures of the previous 30 days. Neutral temperature: 0.54·T<sub>30</sub> + 12.83 °C (naturally ventilated, 90 % band ±2.38 °C; valid for T<sub>30</sub> 12.5–31 °C) and 0.28·T<sub>30</sub> + 17.87 °C (mixed-mode, ±3.46 °C; valid for 13–38.5 °C).</p>") +
          sec("ASHRAE 55 adaptive comfort", "<p>Prevailing mean outdoor temperature as an exponentially weighted mean of the previous 7 days (α = 0.9); comfort temperature 0.31·T<sub>pma</sub> + 17.8 °C with 80 % (±3.5 °C) and 90 % (±2.5 °C) bands.</p>") +
          sec("UTCI", "<p>Universal Thermal Climate Index from the 6th-order polynomial approximation (Bröde et al., 2012). Wind speed is the 10 m value from the file, limited to 0.5–17 m/s; 'no wind' uses 0.5 m/s. Mean radiant temperature in the sun adds the SolarCal (ASHRAE 55 Appendix C) increment for a standing person, with absorptivity 0.7, floor reflectance 0.6 and full sky view, capped at +70 K.</p>") +
          sec("Psychrometrics & heat index", "<p>Saturation pressure from the Hyland–Wexler formulation, wet-bulb temperature from Stull (2011). Heat index from the Rothfusz regression with NWS adjustments.</p>") +
          sec("Strategy advisor", "<p>Each hour is tested against the IMAC naturally-ventilated band and a set of transparent rules (listed on the page). It is a screening tool inspired by bioclimatic charts (Olgyay, Givoni) and should be followed by simulation.</p>") +
          sec("Vastu × Science planner", "<p>Vastu guidance follows the Tejas Constructions Vastu Wheel: eight 45° zones centred on each direction plus the Brahmasthan. A room scores 100 in its first preferred zone, 90 in other preferred zones, 65 in alternatives, 35 in neutral zones and 0 where Vastu discourages it. The science score comes from this site's weather file for each façade direction: solar gain in overheating hours and in the afternoon, morning sun, useful sun in cool weather, the share of warm hours with breeze from that side (by day and at night), the leeward side for kitchens and toilets, and rooftop solar yield. Each room type weighs these differently, e.g. bedrooms favour low afternoon heat and night breeze, while toilets, stores and staircases are best used as buffers on the hottest side. Heating versus cooling need (degree-days, 18 °C / 24 °C) decides how much winter sun counts. The final score blends the two with the balance slider.</p><p><strong>On the plan.</strong> You give the plot size, the direction the road side faces (with a fine-tune for plots turned from the compass grid) and the setbacks. Each room's Vastu zone is the 45° sector, seen from the plot centre, that holds the room's centre; the central ninth of the plot is the Brahmasthan. A room's climate score comes from its <em>outside walls</em> — the sides that lie on the building line — weighted by wall length, so a corner room is judged on both of its façades. Rooms with no outside wall are flagged because they cannot have windows (NBC 2016 asks for openings of about a tenth of the floor area). Auto-arrange splits the building area into a 3 × 3 grid (2 × 2 on small plots), gives each room the free cell with the best blended score, lays out each cell as a squarified treemap starting from its outside walls, puts the main door at the best point on the road side and the tanks in their best corners. The checks look for overlapping rooms, rooms in the setback, a door off the road side, rooms below the indicative NBC 2016 Part 3 minimum area or width, Vastu avoid-zones and strong climate conflicts, each with a suggested fix.</p><p><strong>Tracing your own plan.</strong> Upload a photo or scan of an existing plan, choose whether it shows the whole plot or only the building, then pick a room type and drag a box over each room. Outside walls are found from the outline of the traced building.</p><p><strong>Climate strategies.</strong> For each outside wall the planner sizes a chajja that shades a 1.2 m window for 80 % of the overheating sun-hours (DBT above the IMAC upper limit, direct normal radiation ≥ 50 W/m²), using the vertical shadow angle as in the Shading designer; when more than 1.2 m would be needed it recommends vertical fins or a jaali instead. Walls are classed hot, moderate or cool from the solar heat on that side in overheating hours (winter sun in a cold climate) and given wall and window recommendations for the NBC climate zone, with the roof checked against the Eco-Niwas Samhita 2018 limit (U ≤ 1.2 W/m²K). The warm-weather breeze direction picks the inlet (windward) and outlet (leeward) walls; stack ventilation through the open Brahmasthan is suggested for deep plans and hot-dry or composite climates, and night flushing where summer days are 11 °C or more hotter than nights. Planting follows exposure: shade trees on hot sides, open ground on the north and east and on the breeze side.</p>") +
          sec("Shading designer", "<p>Horizontal shadow angle HSA = sun azimuth − façade azimuth; vertical shadow angle tan(VSA) = tan(altitude)/cos(HSA). Overhang depth to shade a window of height H: D = H / tan(VSA). Fin depth for width W: F = W / tan|HSA|.</p>") +
          sec("U-value & ENS", "<p>U = 1 / (R<sub>si</sub> + Σ d/k + R<sub>se</sub>) after ISO 6946. RETV and openability per Eco-Niwas Samhita 2018 Part I.</p>")) +
        App.card("Glossary", '<dl class="gloss">' +
          "<dt>Chajja</dt><dd>Horizontal projecting sunshade above a window.</dd><dt>Jaali</dt><dd>Perforated screen of stone, terracotta or concrete that shades while letting air through.</dd>" +
          "<dt>Dew point</dt><dd>Temperature at which air becomes saturated; a high dew point (> 20 °C) feels muggy.</dd><dt>DNI / GHI / DHI</dt><dd>Direct normal, global horizontal and diffuse horizontal solar radiation.</dd>" +
          "<dt>Degree days</dt><dd>Sum over the year of the daily difference between outdoor mean temperature and a base temperature.</dd><dt>Mixed-mode</dt><dd>Building that uses natural ventilation when possible and mechanical cooling when needed.</dd>" +
          "<dt>SHGC</dt><dd>Solar heat gain coefficient — the fraction of solar radiation through a window that becomes heat inside.</dd><dt>TMY / TMYx</dt><dd>Typical meteorological year built from the most representative months of a long record.</dd>" +
          "<dt>U-value</dt><dd>Heat flow through 1 m² of an element per kelvin of temperature difference (W/m²K); lower is better insulated.</dd><dt>UTCI</dt><dd>'Feels-like' temperature outdoors combining air temperature, humidity, wind and radiation.</dd></dl>") +
        App.card("References", App.refList());
    },
  };

  App.views.about = {
    html: function () {
      const b = window.BRAND;
      return App.pageHead("About & citation") +
        App.card("About " + App.esc(b.company), "<p><strong>" + App.esc(b.product) + "</strong> is a free climate-analysis and passive-design platform by " + App.esc(b.company) +
          ", built to help architects, engineers, students, builders and home-owners across India design buildings that are comfortable, healthy and low-energy in a warming climate.</p>" +
          "<p>All calculations run locally in your web browser. Weather files you load are never uploaded to any server.</p>" +
          '<p class="muted small">Edit <code>js/config.js</code> to set the company name, contact details and brand colour shown throughout the site.</p>') +
        App.card("Privacy", "<p>Weather files, plan images and everything you type are processed in your browser and are never uploaded. When you load a station, its public weather file is fetched through our Firebase server from the original source.</p>" +
          "<p>If you allow it, Google Analytics for Firebase records anonymous page views and which tools are used (for example, that a Vastu plan was printed or which climate zone a loaded file belongs to). Advertising features and Google signals are switched off. You can change your choice at any time with “Usage statistics settings” at the bottom of every page.</p>") +
        App.card("How to cite", '<div class="cite-box"><p>When you use results from this site, please cite the open-source engine it is built on:</p>' +
          "<blockquote>Betti, G., Tartarini, F., Nguyen, C., Schiavon, S. CBE Clima Tool: A free and open-source web application for climate analysis tailored to sustainable building design. <em>Build. Simul.</em> (2023). " +
          '<a href="https://doi.org/10.1007/s12273-023-1090-5" target="_blank" rel="noopener">https://doi.org/10.1007/s12273-023-1090-5</a></blockquote>' +
          "<p>and, for this India-focused edition:</p><blockquote>" + App.esc(b.company) + " (" + b.year + "). " + App.esc(b.product) + ": climate-responsive design tools for Indian buildings." + (b.website ? " " + App.esc(b.website) : "") + "</blockquote></div>") +
        App.card("Acknowledgements & licences", "<p>This site is an independent, re-engineered edition of the <a href='https://github.com/CenterForTheBuiltEnvironment/clima' target='_blank' rel='noopener'>CBE Clima Tool</a> (© 2021 Center for the Built Environment, MIT licence) by Giovanni Betti, Federico Tartarini, Christine Nguyen and Stefano Schiavon. Comfort algorithms follow <em>pythermalcomfort</em> (MIT). It is not affiliated with or endorsed by UC Berkeley, BIS or BEE.</p>" +
          "<p>Indian code values are provided for early-design guidance; always verify against the latest notified version of NBC, ECBC and Eco-Niwas Samhita.</p>") +
        App.card("References", App.refList());
    },
  };
})(window.App);
