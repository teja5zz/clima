/* Local preview without the Firebase CLI: serves website/ and the /api/epw proxy
   exactly like the Hosting rewrite in firebase.json.
   Usage: node firebase/dev-server.js [port]   →  http://localhost:8080 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { fetchWeather, ProxyError } = require("./functions/proxy");

const ROOT = path.resolve(__dirname, "..", "website");
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".zip": "application/zip", ".ico": "image/x-icon" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/epw") {
    try {
      const out = await fetchWeather(url.searchParams.get("url") || "");
      res.writeHead(200, out.headers).end(out.body);
    } catch (e) {
      res.writeHead(e instanceof ProxyError ? e.status : 502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end("Not found"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }).end(data);
  });
}).listen(PORT, () => console.log("Climate & Vastu Studio on http://localhost:" + PORT));
