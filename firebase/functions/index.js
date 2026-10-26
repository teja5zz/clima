/* Cloud Functions for Climate Studio India. */
"use strict";

const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { fetchWeather, ProxyError } = require("./proxy");

// GET /api/epw?url=<https://climate.onebuilding.org/...zip>
// Served through the Firebase Hosting rewrite in firebase.json (same origin as the site).
exports.epw = onRequest(
  { region: "asia-south1", memory: "256MiB", timeoutSeconds: 60, maxInstances: 10, concurrency: 40, cors: true },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "GET") {
      res.status(405).set("Allow", "GET").json({ error: "Method not allowed." });
      return;
    }
    const target = typeof req.query.url === "string" ? req.query.url : "";
    if (!target) {
      res.status(400).json({ error: "Missing 'url' query parameter." });
      return;
    }
    try {
      const out = await fetchWeather(target);
      res.status(200).set(out.headers).send(out.body);
    } catch (e) {
      const status = e instanceof ProxyError ? e.status : 502;
      if (!(e instanceof ProxyError)) logger.error("epw proxy failure", { target: target, message: e.message });
      res.status(status).set("Cache-Control", "no-store").json({ error: e.message || "Download failed." });
    }
  }
);
