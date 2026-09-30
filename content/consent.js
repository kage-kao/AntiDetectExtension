// Consent auto-reject (Ghostery Never-Consent style), ISOLATED world, document_idle.
//
// Finds common "reject all" buttons of major CMPs (OneTrust, Cookiebot, Didomi,
// Quantcast, Osano, Usercentrics, iubenda, cookieyes, complianz, tarteaucitron,
// Klaro, GDPR Cookie Consent…) plus a text-based fallback in 10 languages, and
// clicks them once. Runs only where the user has it enabled and the site is
// not whitelisted. Watches the DOM for up to 10 s for late-rendered banners.

(function () {
  "use strict";

  try { if (window.__adeConsentAlive && window.__adeConsentAlive()) return; } catch (e) {}
  window.__adeConsentAlive = function () { try { return !!chrome.runtime.id; } catch (e) { return false; } };

  // In iframes only bother when the frame itself looks like a CMP (e.g. Quantcast).
  if (window !== window.top && !/consent|cookie|cmp|gdpr|privacy/i.test(location.hostname + location.pathname)) return;

  var REJECT_SELECTORS = [
    "#onetrust-reject-all-handler",                 // OneTrust / CookiePro
    "#CybotCookiebotDialogBodyButtonDecline",       // Cookiebot
    ".didomi-continue-without-agreeing",            // Didomi
    "#didomi-notice-disagree-button",
    ".iubenda-cs-reject-btn",                       // iubenda
    ".osano-cm-denyAll",                            // Osano
    ".osano-cm-button--type_denyAll",
    "button[data-testid='uc-deny-all-button']",     // Usercentrics
    ".cc-deny", ".cc-btn.cc-deny",                  // cookieconsent v2/v3
    ".cc-nb-reject",                                // cookieconsent v4
    ".cky-btn-reject",                              // CookieYes
    ".cmplz-deny",                                  // Complianz
    "#tarteaucitronAllDenied",                      // tarteaucitron
    ".klaro .cn-decline",                           // Klaro
    "#cookie_action_close_header_reject",           // GDPR Cookie Consent (WebToffee)
    ".woocommerce-notice .reject-all",              // misc
    "button[data-action='reject']",
    "button[mode='secondary'].qc-cmp2-button"       // Quantcast Choice
  ];

  var TEXT_RE = /^(reject all( cookies)?|reject cookies|decline( all)?|deny( all)?|refuse all|only (necessary|essential)( cookies)?|(necessary|essential) (cookies )?only|continue without (agreeing|accepting)|alle ablehnen|ablehnen|nur (notwendige|essenzielle|funktionale)( cookies)?|tout refuser|refuser|continuer sans accepter|rechazar( todo| todas)?|solo necesarias|rifiuta( tutto)?|solo necessari|odrzuc( wszystkie)?|odrzuć( wszystkie)?|tylko niezb[eę]dne|rejeitar( tudo)?|apenas necess[aá]rios|alles weigeren|weigeren|alleen noodzakelijke|отклонить( все)?|отказаться( от всех)?|только необходимые)$/i;

  var done = false;

  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && parseFloat(st.opacity) > 0.05;
  }

  // Text fallback safety: the button must live inside a consent-ish container.
  // ("notice"/"privacy" are deliberately absent — too many false positives like
  // "admin-notice" or a privacy-policy footer with an unrelated "decline" button.)
  function inConsentCtx(el) {
    var n = el;
    for (var i = 0; i < 6 && n; i++) {
      var cls = n.className;
      if (cls && typeof cls !== "string") cls = cls.baseVal || "";
      var s = ((n.id || "") + " " + (cls || "")).toLowerCase();
      if (/cookie|consent|gdpr|\bcmp\b/.test(s)) return true;
      n = n.parentElement;
    }
    return false;
  }

  function clickOnce(el) {
    if (done) return;
    done = true;
    try { el.click(); } catch (e) {}
  }

  function tryReject() {
    if (done) return;
    for (var i = 0; i < REJECT_SELECTORS.length; i++) {
      var el;
      try { el = document.querySelector(REJECT_SELECTORS[i]); } catch (e) { continue; }
      if (el && visible(el)) { clickOnce(el); return; }
    }
    var btns = document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']");
    for (var j = 0; j < btns.length; j++) {
      var b = btns[j];
      var txt = (b.textContent || b.value || b.getAttribute("aria-label") || "").trim();
      if (txt && txt.length < 60 && TEXT_RE.test(txt) && visible(b) && inConsentCtx(b)) { clickOnce(b); return; }
    }
  }

  function start() {
    tryReject();
    if (done) return;
    // Coalesce mutation bursts (attribute-filtered observers fire a lot on heavy pages).
    var scheduled = false;
    var obs = new MutationObserver(function () {
      if (done) { obs.disconnect(); return; }
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () { scheduled = false; tryReject(); if (done) obs.disconnect(); }, 120);
    });
    try {
      obs.observe(document.documentElement, {
        childList: true, subtree: true,
        attributes: true, attributeFilter: ["class", "style"] // banners revealed by a class flip
      });
    } catch (e) { return; }
    setTimeout(function () { obs.disconnect(); }, 10000);
  }

  try {
    adeGetSettings().then(function (s) {
      if (!s.enabled || !s.autoConsent) return;
      var host = String(location.hostname || "").replace(/^www\./, "");
      if (!host || adeIsWhitelisted(s, host) || adeIsBuiltinBypass(host)) return;
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
      else start();
    });
  } catch (e) {}
})();
