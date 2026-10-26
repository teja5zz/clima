/* Allow-listed, size-limited download of EnergyPlus weather files on behalf of the
   browser. The weather repositories do not send CORS headers, so the website cannot
   fetch them directly. */
"use strict";

const ALLOWED_HOSTS = new Set([
  "climate.onebuilding.org",
  "energyplus-weather.s3.amazonaws.com",
  "energyplus.net",
  "www.energyplus.net",
]);
const ALLOWED_EXT = /\.(zip|epw)$/i;
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_REDIRECTS = 3;

class ProxyError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validate(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch (e) {
    throw new ProxyError(400, "Parameter 'url' is not a valid URL.");
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && ALLOWED_HOSTS.has(u.hostname))) {
    throw new ProxyError(400, "Only http(s) URLs are supported.");
  }
  if (!ALLOWED_HOSTS.has(u.hostname)) {
    throw new ProxyError(403, "Host not allowed. Supported: " + Array.from(ALLOWED_HOSTS).join(", "));
  }
  if (u.username || u.password || (u.port && u.port !== "443" && u.port !== "80")) {
    throw new ProxyError(400, "Credentials and custom ports are not allowed.");
  }
  if (!ALLOWED_EXT.test(u.pathname)) {
    throw new ProxyError(400, "Only .zip and .epw weather files can be downloaded.");
  }
  return u;
}

// Returns { status, headers, body: Buffer } for the given URL string.
async function fetchWeather(raw, fetchImpl) {
  const doFetch = fetchImpl || fetch;
  let url = validate(raw);
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let res;
    try {
      res = await doFetch(url.toString(), {
        redirect: "manual",
        headers: { "User-Agent": "ClimateStudioIndia/1.0 (+weather-file proxy)" },
      });
    } catch (e) {
      throw new ProxyError(504, "Could not reach " + url.hostname + ". Try again later, or pick another version of the file.");
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = validate(new URL(res.headers.get("location"), url).toString());
      continue;
    }
    if (res.status === 404) throw new ProxyError(404, "The weather file was not found at the source.");
    if (!res.ok) throw new ProxyError(502, "The weather source responded with HTTP " + res.status + ".");
    const declared = Number(res.headers.get("content-length") || 0);
    if (declared > MAX_BYTES) throw new ProxyError(413, "File is larger than the 30 MB limit.");
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new ProxyError(413, "File is larger than the 30 MB limit.");
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    const isZip = body.length > 1 && body[0] === 0x50 && body[1] === 0x4b;
    const looksEpw = body.slice(0, 8).toString("latin1") === "LOCATION";
    if (!isZip && !looksEpw) throw new ProxyError(502, "The source did not return a weather file.");
    return {
      status: 200,
      body: body,
      headers: {
        "Content-Type": isZip ? "application/zip" : "text/plain; charset=utf-8",
        // let Firebase Hosting's CDN keep popular stations for a week
        "Cache-Control": "public, max-age=86400, s-maxage=604800",
        "X-Source-Url": url.toString(),
      },
    };
  }
  throw new ProxyError(508, "Too many redirects.");
}

module.exports = { fetchWeather, validate, ProxyError, ALLOWED_HOSTS, MAX_BYTES };
