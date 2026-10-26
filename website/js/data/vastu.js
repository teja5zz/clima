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
  App.VASTU_CENTRE = { id: "C", name: "Centre", deity: "Brahmasthan", element: "Space", color: "#e6e4ec",
    uses: ["Open hall", "Courtyard", "Central passage"], avoid: "Toilets, kitchen, staircase, heavy columns, tanks or heavy furniture" };

  // pref = preferred directions (first is ideal), alt = acceptable alternatives, avoid = discouraged.
  // sci = which climate profile the science score uses (see views/vastu.js).
  App.VASTU_ROOMS = [
    { id: "entrance", label: "Main entrance", pref: ["N", "E", "NE"], alt: [], avoid: ["SW"], sci: "entrance", def: true },
    { id: "living", label: "Living room", pref: ["N", "E", "NE"], alt: [], avoid: ["SW"], sci: "living", def: true },
    { id: "pooja", label: "Pooja room", pref: ["NE"], alt: ["E", "N"], avoid: ["S", "SW", "W", "NW", "SE"], sci: "pooja", def: true },
    { id: "kitchen", label: "Kitchen", pref: ["SE"], alt: ["NW"], avoid: ["NE", "S", "W", "C"], sci: "kitchen", def: true },
    { id: "dining", label: "Dining", pref: ["E", "W"], alt: [], avoid: [], sci: "dining", def: true },
    { id: "master", label: "Master bedroom", pref: ["SW"], alt: ["S", "W"], avoid: ["SE", "NE"], sci: "bedroom", def: true },
    { id: "children", label: "Children's bedroom", pref: ["W", "NW", "E"], alt: [], avoid: ["SE"], sci: "bedroom", def: true },
    { id: "guest", label: "Guest bedroom", pref: ["NW"], alt: ["W"], avoid: ["SE"], sci: "bedroom", def: false },
    { id: "study", label: "Study / home office", pref: ["E", "N", "NE"], alt: [], avoid: [], sci: "study", def: false },
    { id: "toilets", label: "Toilets / bathrooms", pref: ["W", "NW"], alt: ["S"], avoid: ["NE", "C", "N", "SE"], sci: "buffer", def: true },
    { id: "staircase", label: "Staircase", pref: ["S", "W", "SW"], alt: [], avoid: ["NE", "C"], sci: "buffer", def: true },
    { id: "store", label: "Store / heavy storage", pref: ["SW", "S"], alt: ["W"], avoid: ["NE", "NW", "C"], sci: "buffer", def: false },
    { id: "open", label: "Open space / garden", pref: ["NE", "N", "E"], alt: [], avoid: ["SW"], sci: "open", def: false },
    { id: "ohtank", label: "Overhead water tank", pref: ["SW", "W"], alt: [], avoid: ["NE", "C"], sci: "roofshade", def: false },
    { id: "ugtank", label: "Underground water tank / sump", pref: ["N", "NE"], alt: [], avoid: ["SE", "SW", "C"], sci: null, def: false },
    { id: "septic", label: "Septic tank", pref: ["NW"], alt: [], avoid: ["N", "E", "NE", "C"], sci: null, def: false },
    { id: "solar", label: "Solar panels (facing)", pref: ["S", "SW", "W"], alt: [], avoid: [], sci: "solar", def: false },
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
    if (room.alt.indexOf(zoneId) >= 0) return "Alternative";
    if (room.avoid.indexOf(zoneId) >= 0) return "Avoid";
    return "Neutral";
  };
})(window.App);
