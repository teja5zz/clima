/* Vastu knowledge base, transcribed from the Tejas Constructions "Vastu Wheel for
   Residential Plans": 8 directional zones of 45° centred on each direction, plus the
   centre (Brahmasthan), and the room placement quick reference. */
window.App = window.App || {};
(function (App) {
  "use strict";

  App.VASTU_ZONES = [
    { id: "N", name: "North", deity: "Kubera", az: 0, element: "Water", theme: "Wealth, opportunities, career, flow", color: "#7fc6b5",
      uses: ["Entrance", "Living room", "Study", "Cash locker"], avoid: "Heavy structures, toilets, septic tank" },
    { id: "NE", name: "North-East", deity: "Ishanya", az: 45, element: "Water", theme: "Health, spirituality, clarity", color: "#a8cbe0",
      uses: ["Pooja room", "Meditation", "Open space", "Water feature"], avoid: "Toilets, kitchen, staircase, heavy storage" },
    { id: "E", name: "East", deity: "Indra", az: 90, element: "Air", theme: "Growth, knowledge, family, health", color: "#a6d18f",
      uses: ["Living room", "Dining", "Study", "Children's bedroom"], avoid: "Heavy construction, septic tank" },
    { id: "SE", name: "South-East", deity: "Agni", az: 135, element: "Fire", theme: "Kitchen, energy, prosperity", color: "#f4d36b",
      uses: ["Kitchen", "Electricals", "Fire place", "Generator"], avoid: "Toilets, water tank, bedrooms" },
    { id: "S", name: "South", deity: "Yama", az: 180, element: "Fire + Earth", theme: "Stability, strength, reputation", color: "#f2a98c",
      uses: ["Master bedroom", "Staircase", "Heavy storage", "Gym"], avoid: "Kitchen, pooja room, water features" },
    { id: "SW", name: "South-West", deity: "Nairutya", az: 225, element: "Earth", theme: "Master bedroom, security, long-term growth", color: "#c58b77",
      uses: ["Master bedroom", "Wardrobe", "Safe / locker", "Heavy storage"], avoid: "Open space, main entrance, water tank" },
    { id: "W", name: "West", deity: "Varuna", az: 270, element: "Air + Earth", theme: "Creativity, children, support", color: "#b19ad7",
      uses: ["Guest bedroom", "Dining", "Toilets", "Store"], avoid: "Kitchen, pooja room, open water" },
    { id: "NW", name: "North-West", deity: "Vayu", az: 315, element: "Air", theme: "Movement, guests, change", color: "#d3a9c4",
      uses: ["Guest bedroom", "Kids bedroom", "Toilets", "Movement"], avoid: "Pooja room, kitchen, heavy storage" },
  ];
  App.VASTU_CENTRE = { id: "C", name: "Centre", deity: "Brahmasthan", az: null, element: "Space", theme: "Open, light, connecting", color: "#e6e4ec",
    uses: ["Open hall", "Courtyard", "Central passage"], avoid: "Toilets, kitchen, staircase, heavy columns, tanks or heavy furniture" };

  /* Placeable items.
     kind: "room" (a rectangle on the plan), "door" (the main entrance, on an outside wall) or
           "fixture" (a point: tanks, sump, septic).
     pref = preferred zones (first is ideal), alt = acceptable, avoid = discouraged ("C" = Brahmasthan).
     sci  = climate profile (core/siting.js); null where the climate has no bearing.
     area = typical size in m²; nbc = indicative minimum area (m²) and width (m) after NBC 2016 Part 3.
     habitable = needs an outside wall for windows. */
  App.VASTU_ROOMS = [
    { id: "entrance", label: "Main entrance", short: "Entrance", kind: "door", pref: ["N", "E", "NE"], alt: [], avoid: ["SW"], sci: "entrance", color: "#1f2a44" },
    { id: "living", label: "Living room", short: "Living", kind: "room", area: 16, nbc: [9.5, 2.4], habitable: true, pref: ["N", "E", "NE"], alt: ["C"], avoid: ["SW"], sci: "living", color: "#7fc6b5" },
    { id: "dining", label: "Dining", short: "Dining", kind: "room", area: 10, pref: ["E", "W"], alt: ["C"], avoid: [], sci: "dining", color: "#a6d18f" },
    { id: "kitchen", label: "Kitchen", short: "Kitchen", kind: "room", area: 8.5, nbc: [5.0, 1.8], habitable: true, pref: ["SE"], alt: ["NW"], avoid: ["NE", "S", "W", "C"], sci: "kitchen", color: "#f4d36b" },
    { id: "pooja", label: "Pooja room", short: "Pooja", kind: "room", area: 2.5, pref: ["NE"], alt: ["E", "N"], avoid: ["S", "SW", "W", "NW", "SE"], sci: "pooja", color: "#f6c27a" },
    { id: "master", label: "Master bedroom", short: "Master bed", kind: "room", area: 13.5, nbc: [9.5, 2.4], habitable: true, pref: ["SW"], alt: ["S", "W"], avoid: ["SE", "NE"], sci: "bedroom", color: "#c58b77" },
    { id: "children", label: "Children's bedroom", short: "Kids bed", kind: "room", area: 11, nbc: [7.5, 2.1], habitable: true, pref: ["W", "NW", "E"], alt: [], avoid: ["SE"], sci: "bedroom", color: "#b19ad7" },
    { id: "guest", label: "Guest bedroom", short: "Guest bed", kind: "room", area: 11, nbc: [7.5, 2.1], habitable: true, pref: ["NW"], alt: ["W"], avoid: ["SE"], sci: "bedroom", color: "#d3a9c4" },
    { id: "study", label: "Study / home office", short: "Study", kind: "room", area: 8, nbc: [7.5, 2.1], habitable: true, pref: ["E", "N", "NE"], alt: [], avoid: [], sci: "study", color: "#a8cbe0" },
    { id: "toilets", label: "Toilet / bathroom", short: "Toilet", kind: "room", area: 4, nbc: [2.8, 1.2], pref: ["W", "NW"], alt: ["S"], avoid: ["NE", "C", "N", "SE"], sci: "buffer", color: "#9fb4c7" },
    { id: "staircase", label: "Staircase", short: "Stairs", kind: "room", area: 8, pref: ["S", "W", "SW"], alt: [], avoid: ["NE", "C"], sci: "buffer", color: "#b8a99a" },
    { id: "store", label: "Store / heavy storage", short: "Store", kind: "room", area: 3.5, pref: ["SW", "S"], alt: ["W"], avoid: ["NE", "NW", "C"], sci: "buffer", color: "#a89f91" },
    { id: "open", label: "Courtyard / open space", short: "Courtyard", kind: "room", area: 12, pref: ["NE", "N", "E"], alt: ["C"], avoid: ["SW"], sci: "open", color: "#cfe8c4" },
    { id: "ohtank", label: "Overhead water tank", short: "OH tank", kind: "fixture", pref: ["SW", "W"], alt: [], avoid: ["NE", "C"], sci: "roofshade", color: "#4a6fb5" },
    { id: "ugtank", label: "Underground sump", short: "Sump", kind: "fixture", pref: ["N", "NE"], alt: [], avoid: ["SE", "SW", "C"], sci: null, color: "#1c7ed6" },
    { id: "septic", label: "Septic tank", short: "Septic", kind: "fixture", pref: ["NW"], alt: [], avoid: ["N", "E", "NE", "C"], sci: null, color: "#6b6156" },
  ];
  App.VASTU_ROOM = {};
  App.VASTU_ROOMS.forEach(function (r) { App.VASTU_ROOM[r.id] = r; });

  // Rooftop solar is a roof-tilt decision, not a room position; reported separately.
  App.VASTU_SOLAR = { id: "solar", label: "Solar panels (facing)", pref: ["S", "SW", "W"], alt: [], avoid: [], sci: "solar" };

  // Room programmes (house types) to start from.
  App.VASTU_PRESETS = [
    { id: "1bhk", label: "1 BHK", items: ["entrance", "living", "kitchen", "master", "toilets", "pooja", "ugtank", "ohtank"] },
    { id: "2bhk", label: "2 BHK", items: ["entrance", "living", "dining", "kitchen", "pooja", "master", "children", "toilets", "toilets", "staircase", "ugtank", "ohtank"] },
    { id: "3bhk", label: "3 BHK", items: ["entrance", "living", "dining", "kitchen", "pooja", "master", "children", "guest", "toilets", "toilets", "toilets", "staircase", "store", "ugtank", "ohtank"] },
    { id: "villa", label: "4 BHK villa", items: ["entrance", "living", "dining", "kitchen", "pooja", "master", "children", "children", "guest", "study", "toilets", "toilets", "toilets", "toilets", "staircase", "store", "open", "ugtank", "ohtank", "septic"] },
  ];

  App.VASTU_NOTES = [
    "Vastu is a traditional system; its claims are not scientifically proven. Use it only where it does not compromise structure, safety, light or ventilation.",
    "Statutory requirements always take precedence: local building bylaws, the National Building Code of India (NBC 2016) and structural design codes (e.g. IS 456, IS 1893).",
    "Compass (magnetic) north and true north differ by the local magnetic declination — only a few degrees across India — and a plot tilted from the cardinal grid shifts the zones. Confirm which north your survey uses.",
    "Classical texts also split the wheel into 16 zones of 22.5°, and sources differ on the elements of the cardinal directions.",
    "For complex sites (corner plots, multiple roads, slopes) involve a Vastu consultant and an architect. This tool is a planning aid, not professional advice.",
  ];

  App.vastuScore = function (room, zoneId) {
    if (room.pref.indexOf(zoneId) === 0) return 1;
    if (room.pref.indexOf(zoneId) > 0) return 0.9;
    if (room.alt.indexOf(zoneId) >= 0) return 0.65;
    if (room.avoid.indexOf(zoneId) >= 0) return 0;
    return 0.35;
  };
  App.vastuVerdict = function (room, zoneId) {
    if (room.pref.indexOf(zoneId) >= 0) return "Preferred";
    if (room.alt.indexOf(zoneId) >= 0) return "Acceptable";
    if (room.avoid.indexOf(zoneId) >= 0) return "Avoid";
    return "Neutral";
  };
  App.zoneById = function (id) {
    return id === "C" ? App.VASTU_CENTRE : App.VASTU_ZONES.find(function (z) { return z.id === id; });
  };
})(window.App);
