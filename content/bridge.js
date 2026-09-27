// ISOLATED bridge: storage -> MAIN hooks (full legend payload) + localStorage mirror + cosmetic CSS.

(function () {
  "use strict";
  var EV_CFG = "__ade_v2_cfg", EV_TRIG = "__ade_v2_trig";
  var LS_KEY = "__ade_v2";

  try { if (window.__adeBridgeAlive && window.__adeBridgeAlive()) return; } catch (e) {}
  window.__adeBridgeAlive = function () { try { return !!chrome.runtime.id; } catch (e) { return false; } };

  var COSMETIC = [
    "[id^='google_ads_']", "[id^='div-gpt-ad']", "ins.adsbygoogle",
    "iframe[src*='doubleclick']", "iframe[src*='googlesyndication']",
    "[class*='adsbygoogle']", "[class^='ad-'][class*='banner']",
    ".ad-banner", ".ad-container", ".ads-container", ".advertisement",
    ".sponsored-content", "[data-ad-slot]", "[aria-label='Advertisement']",
    ".taboola", ".OUTBRAIN", "[id*='taboola']", "[id*='outbrain']"
  ];

  function frameHost() {
    var h = location.hostname;
    if (!h) { try { h = window.parent.location.hostname; } catch (e) {}
    }
    if (!h) { try { h = new URL(location.ancestorOrigins[0]).hostname; } catch (e) {} }
    return String(h || "").replace(/^www\./, "");
  }
  var host = frameHost();
  var cfPath = /\/cdn-cgi\/challenge-platform\//.test(location.pathname || "");
  var style = null;

  function attachStyle() {
    var root = document.head || document.documentElement;
    if (root) root.appendChild(style);
    else document.addEventListener("DOMContentLoaded", attachStyle, { once: true });
  }

  function applyCosmetic(active, s) {
    var sel = [];
    if (active && s.cosmetic) sel = sel.concat(COSMETIC);
    if (active) (s.userHideSelectors || []).forEach(function (x) { x = String(x).trim(); if (x) sel.push(x); });
    if (!sel.length) { if (style) { style.remove(); style = null; } return; }
    if (!style) style = document.createElement("style");
    style.textContent = sel.map(function (x) { return x + "{display:none !important;}"; }).join("\n");
    if (!style.isConnected) attachStyle();
  }

  function mirror(profile, mode) {
    try {
      if (mode === "stable" && profile) localStorage.setItem(LS_KEY, JSON.stringify({ mode: mode, legend: profile }));
      else localStorage.setItem(LS_KEY, JSON.stringify({ mode: mode || "stable" }));
    } catch (e) {}
  }

  function apply(settings) {
    var active = !!settings.enabled && !adeIsWhitelisted(settings, host) && !adeIsBuiltinBypass(host) && !cfPath;
    var profile = adeActiveProfile(settings);
    mirror(profile, settings.mode);
    try {
      window.dispatchEvent(new CustomEvent(EV_CFG, {
        detail: JSON.stringify({ active: active, groups: settings.groups, mode: settings.mode, legend: active ? profile : null })
      }));
    } catch (e) {}
    applyCosmetic(active, settings);
  }

  adeGetSettings().then(apply);

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes.settings) apply(adeMergeDefaults(changes.settings.newValue));
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === "SETTINGS_UPDATED") apply(adeMergeDefaults(msg.settings));
  });

  window.addEventListener(EV_TRIG, function (e) {
    try {
      if (!chrome.runtime.id) return;
      chrome.runtime.sendMessage({ type: "ade-trigger", kind: String(e.detail) }, function () { void chrome.runtime.lastError; });
    } catch (err) {}
  });
})();
