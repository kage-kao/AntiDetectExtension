// ISOLATED bridge: storage -> MAIN hooks (full legend payload) + cosmetic CSS.
//
// The legend is handed to the MAIN world ONLY through a private DOM CustomEvent (EV_CFG),
// dispatched at document_start. It is NEVER written to localStorage/sessionStorage: a
// page-readable copy of the legend was both a super-cookie (a stable cross-visit id) and a
// blatant "this is an anti-detect extension" marker. Same-tab reloads and sibling tabs get
// the legend re-delivered by the background service worker (it holds the profile in
// chrome.storage), so nothing page-visible has to persist it.

(function () {
  "use strict";
  var EV_CFG = "__x7f3cfg", EV_TRIG = "__x7f3trg";

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

  // Legend is keyed by the top-level site, so iframes share the page's fingerprint.
  function topHost() {
    if (window === window.top) return host;
    try { var ao = location.ancestorOrigins; if (ao && ao.length) return new URL(ao[ao.length - 1]).hostname; } catch (e) {}
    try { return window.top.location.hostname; } catch (e) {}
    return host;
  }
  var site = adeSiteKey(topHost());
  var siteMode = false, applySeq = 0;

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

  function resolveLegend(settings, active) {
    var fallback = adeActiveProfile(settings);
    if (!active || !siteMode) return Promise.resolve(fallback);
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ type: "ade-site-legend", site: site }, function (r) {
          void chrome.runtime.lastError;
          resolve((r && r.legend) || fallback);
        });
      } catch (e) { resolve(fallback); }
    });
  }

  function apply(settings) {
    var active = !!settings.enabled && !adeIsWhitelisted(settings, host) && !adeIsBuiltinBypass(host) && !cfPath;
    var n = ++applySeq;
    siteMode = settings.mode === "stable" && settings.rotateIdentity === "site";
    applyCosmetic(active, settings);
    if (active && settings.ampRedirect) whenReady(ampBypass);
    return resolveLegend(settings, active).then(function (profile) {
      if (n !== applySeq) return;
      try {
        var groups = Object.assign({}, settings.groups, { gpc: !!settings.gpc, adtech: !!settings.blockAdTopics });
        window.dispatchEvent(new CustomEvent(EV_CFG, {
          detail: JSON.stringify({ active: active, groups: groups, mode: settings.mode, legend: active ? profile : null })
        }));
      } catch (e) {}
    });
  }

  function reapply() { return adeGetSettings().then(apply); }

  // bfcache restore: the MAIN hooks are re-derived from a fresh EV_CFG.
  window.addEventListener("pageshow", function (e) { if (e.persisted) reapply(); });

  function whenReady(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn, { once: true });
    else fn();
  }

  // AMP page -> its canonical original (once per target, so canonical->AMP bounces can't loop).
  var ampDone = false;
  function ampBypass() {
    if (ampDone || window !== window.top) return;
    ampDone = true;
    var html = document.documentElement;
    if (!html || !(html.hasAttribute("amp") || html.hasAttribute("\u26A1"))) return;
    var link = document.querySelector("link[rel='canonical']");
    var target;
    try { target = new URL(link.getAttribute("href"), location.href); } catch (e) { return; }
    if (!/^https?:$/.test(target.protocol) || target.href === location.href) return;
    try {
      if (sessionStorage.getItem("__ade_amp") === target.href) return;
      sessionStorage.setItem("__ade_amp", target.href);
    } catch (e) {}
    location.replace(target.href);
  }

  reapply();

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes.settings) apply(adeMergeDefaults(changes.settings.newValue));
  });

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg) return;
    if (msg.type === "SETTINGS_UPDATED") apply(adeMergeDefaults(msg.settings));
    if (msg.type === "ade-forget") {
      var done = reapply();
      if (window !== window.top) return;
      done.then(function () { sendResponse({ ok: true }); }, function () { sendResponse({ ok: false }); });
      return true;
    }
  });

  window.addEventListener(EV_TRIG, function (e) {
    try {
      if (!chrome.runtime.id) return;
      chrome.runtime.sendMessage({ type: "ade-trigger", kind: String(e.detail) }, function () { void chrome.runtime.lastError; });
    } catch (err) {}
  });
})();
