const test = require("node:test");
const assert = require("node:assert");
const { fetchWeather, validate, ProxyError } = require("../proxy");

function fakeResponse(status, body, headers) {
  const h = new Map(Object.entries(headers || {}));
  return {
    status: status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => h.get(k.toLowerCase()) || null },
    body: (async function* () { if (body) yield Buffer.from(body); })(),
  };
}

test("rejects hosts outside the allow-list", () => {
  assert.throws(() => validate("https://evil.example.com/a.zip"), (e) => e instanceof ProxyError && e.status === 403);
  assert.throws(() => validate("https://climate.onebuilding.org.evil.com/a.zip"), (e) => e.status === 403);
  assert.throws(() => validate("file:///etc/passwd"), (e) => e.status === 400);
  assert.throws(() => validate("https://climate.onebuilding.org/index.html"), (e) => e.status === 400);
  assert.throws(() => validate("https://user:pw@climate.onebuilding.org/a.zip"), (e) => e.status === 400);
  assert.throws(() => validate("https://climate.onebuilding.org:8443/a.zip"), (e) => e.status === 400);
  assert.ok(validate("https://climate.onebuilding.org/WMO_Region_2_Asia/IND_India/a.zip"));
});

test("follows redirects only within allowed hosts", async () => {
  const calls = [];
  const f = async (u) => {
    calls.push(u);
    if (calls.length === 1) return fakeResponse(302, null, { location: "https://169.254.169.254/latest.zip" });
    return fakeResponse(200, "LOCATION,x");
  };
  await assert.rejects(fetchWeather("https://energyplus.net/a.zip", f), (e) => e.status === 403);
});

test("returns zip files with cache headers", async () => {
  const f = async () => fakeResponse(200, Buffer.from([0x50, 0x4b, 3, 4, 0]), { "content-length": "5" });
  const out = await fetchWeather("https://energyplus-weather.s3.amazonaws.com/x/IND_A.zip", f);
  assert.strictEqual(out.headers["Content-Type"], "application/zip");
  assert.match(out.headers["Cache-Control"], /s-maxage/);
});

test("rejects non-weather payloads and oversize files", async () => {
  await assert.rejects(fetchWeather("https://energyplus.net/a.epw", async () => fakeResponse(200, "<html>")), (e) => e.status === 502);
  await assert.rejects(fetchWeather("https://energyplus.net/a.zip", async () => fakeResponse(200, "PK", { "content-length": String(64 * 1024 * 1024) })), (e) => e.status === 413);
  await assert.rejects(fetchWeather("https://energyplus.net/a.zip", async () => fakeResponse(404, "")), (e) => e.status === 404);
});
