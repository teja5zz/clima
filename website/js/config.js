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

/* Site services. epwMirror is the folder of station weather files copied onto the site
   at deploy time (tools/mirror_epw.py). epwProxy is the optional Firebase Cloud Function
   (see firebase.json) used for files that are not mirrored; set it to "" without it. */
window.SITE = {
  epwMirror: "epw/",
  epwProxy: "/api/epw",
  stationCatalogue: "data/india-stations.json",
};

/* Firebase web app (project climate-and-vastu-studio). These identifiers are public by
   design; access is controlled by Firebase security rules, not by hiding them.
   Analytics only starts after the visitor accepts the consent banner. */
window.FIREBASE = {
  sdkVersion: "12.19.0",
  analytics: true,
  config: {
    apiKey: "AIzaSyDFvXK8DD64NBG81VKPmaP9Lad9ctv1TSg",
    authDomain: "climate-and-vastu-studio.firebaseapp.com",
    projectId: "climate-and-vastu-studio",
    storageBucket: "climate-and-vastu-studio.firebasestorage.app",
    messagingSenderId: "139127575101",
    appId: "1:139127575101:web:7786b05f7489c23a3fd054",
    measurementId: "G-0Y9HCEL68P",
  },
};
