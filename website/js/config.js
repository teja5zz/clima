/* ============================================================
   BRAND SETTINGS — edit this file to change the company details.
   Every page, title, footer and export picks these values up.
   ============================================================ */
window.BRAND = {
  company: "Tejas Constructions",
  product: "Climate & Vastu Studio",
  owner: "Tejas P R, BE, MS — Chartered Structural Engineer · Proprietor",
  shortMark: "TC",                       // shown only if the logo image is missing
  logo: "img/logo-tc.png",
  tagline: "Science-backed, Vastu-aware design decisions for Indian buildings",
  website: "https://www.tejas-constructions.in",
  email: "info@tejas-constructions.in",
  phone: "+91 81975 17555",
  address: "#345, 14th Main, 5th Cross, First floor, Saraswathipuram, Mysore – 570009",
  services: ["Structural Design", "Turnkey Projects", "Joint Ventures", "Construction Services", "Project Estimation"],
  motto: "Right orientation · Better planning · Harmonious living",
  accent: "#e8801a",                     // brand orange (text-safe shade of the logo orange)
  ink: "#1f2a44",                        // brand navy
  year: new Date().getFullYear(),
};

/* Site services. epwProxy is the Firebase Cloud Function (see firebase.json) that
   downloads weather files for the browser; set it to "" on hosts without it. */
window.SITE = {
  epwProxy: "/api/epw",
  stationCatalogue: "data/india-stations.json",
};
