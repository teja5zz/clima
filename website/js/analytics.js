/* Consent-gated Google Analytics for Firebase. Nothing is loaded until the visitor
   accepts; the choice is remembered in this browser only. Weather files, plans and
   Vastu inputs are never sent — only page views and anonymous feature usage. */
window.App = window.App || {};
(function (App) {
  "use strict";
  const KEY = "csi-analytics-consent";
  let analytics = null, logEvent = null, queue = [];

  function getChoice() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function setChoice(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ } }

  async function start() {
    const fb = window.FIREBASE;
    if (!fb || !fb.analytics || analytics) return;
    try {
      const base = "https://www.gstatic.com/firebasejs/" + fb.sdkVersion + "/";
      const appMod = await import(base + "firebase-app.js");
      const anMod = await import(base + "firebase-analytics.js");
      if (!(await anMod.isSupported())) return;
      const app = appMod.initializeApp(fb.config);
      analytics = anMod.initializeAnalytics(app, { config: { allow_google_signals: false, allow_ad_personalization_signals: false } });
      logEvent = anMod.logEvent;
      queue.forEach(function (e) { logEvent(analytics, e[0], e[1]); });
      queue = [];
    } catch (e) { /* blocked by an ad-blocker or offline: the site works without analytics */ }
  }

  // Record an anonymous event (no file contents, coordinates or personal data).
  App.track = function (name, params) {
    if (getChoice() !== "yes") return;
    if (analytics) logEvent(analytics, name, params || {});
    else if (queue.length < 50) queue.push([name, params || {}]);
  };

  App.showConsent = function () {
    if (!window.FIREBASE || !window.FIREBASE.analytics) return;
    let bar = document.getElementById("consent");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "consent";
      bar.className = "consent";
      bar.setAttribute("role", "dialog");
      bar.setAttribute("aria-label", "Usage statistics");
      bar.innerHTML = "<p><strong>Help us improve this tool?</strong> With your permission we count page visits and which tools are used " +
        "(Google Analytics for Firebase). Weather files, plans and your inputs never leave your device. <a href=\"#/about\">Privacy</a></p>" +
        '<div class="consent-btns"><button class="btn ghost sm" type="button" data-consent="no">No thanks</button>' +
        '<button class="btn primary sm" type="button" data-consent="yes">Allow</button></div>';
      document.body.appendChild(bar);
      bar.addEventListener("click", function (e) {
        const b = e.target.closest("[data-consent]");
        if (!b) return;
        setChoice(b.dataset.consent);
        bar.remove();
        if (b.dataset.consent === "yes") start(); // Analytics records the first page view itself
      });
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    const c = getChoice();
    if (c === "yes") start();
    else if (c === null) setTimeout(App.showConsent, 1200);
    window.addEventListener("hashchange", function () {
      App.track("page_view", { page_title: document.title, page_location: location.origin + location.pathname + location.hash });
    });
  });
})(window.App);
