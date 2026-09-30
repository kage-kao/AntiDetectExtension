// MAIN world: ANALYTICS — neutralize analytics, product-analytics & session-replay SDKs.
// Studied from PostHog, Matomo, Umami, Plausible, OpenPanel, RudderStack, Countly,
// OpenReplay, Highlight, Amplitude, Mixpanel, Segment, Heap, Hotjar, FullStory, LogRocket.
// Two layers: (1) fake vendor-host / known-endpoint network calls, (2) inert SDK-global
// stubs so first-party-proxied SDKs record nothing either.
//
// Stubs are CONDITIONAL: the installed getters consult the live config, so turning the
// group off restores the real globals (a previously installed window.posthog & co.
// reappears) instead of leaving permanent stubs behind.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;
  var NP = typeof Navigator !== "undefined" ? Navigator.prototype : null;

  var STUB = null;
  function analyticsStub() {
    if (STUB) return STUB;
    STUB = new M.PX(function () {}, {
      get: function (t, k) {
        if (k === "then" || k === "catch" || k === "finally") return undefined;
        if (k === Symbol.toPrimitive) return function () { return ""; };
        if (k === Symbol.toStringTag) return undefined;
        if (k === "toString" || k === "valueOf") return function () { return ""; };
        if (k === "length") return 0;
        return STUB;
      },
      apply: function () { return STUB; },
      construct: function () { return STUB; },
      set: function () { return true; }
    });
    return STUB;
  }

  // Values the page assigns while stubbed are kept and handed back when the group is off.
  var realVals = {};
  var stubsInstalled = false;
  function installStubs() {
    if (stubsInstalled || !NP) return;
    stubsInstalled = true;
    var s = analyticsStub();

    function silentArray(name) {
      var a = [];
      try { M.defProp(a, "push", { value: M.makeNative(function () {
        if (!M.wanted("analytics")) { Array.prototype.push.apply(a, arguments); }
        return a.length;
      }, Array.prototype.push), writable: true, configurable: true }); } catch (e) {}
      return a;
    }

    function defStub(name, val, isArray) {
      var d;
      try { d = M.gOPD(window, name); } catch (e) {}
      if (d && d.configurable === false) return; // can't touch it — leave the real global alone
      realVals[name] = d && "value" in d ? d.value : undefined;
      try {
        M.defProp(window, name, {
          configurable: true,
          get: function () { return M.wanted("analytics") ? val : realVals[name]; },
          set: function (v) { realVals[name] = v; }
        });
      } catch (e) {}
    }

    // Unambiguous vendor globals only (avoid generic single letters that collide with page code).
    ["posthog", "amplitude", "mixpanel", "heap", "FS", "LogRocket", "Countly",
     "rudderanalytics", "umami", "plausible", "ga", "gtag", "hj", "_hjSettings",
     "fbq", "ym", "clarity", "snaptr", "twq", "pintrk", "Sentry", "smartlook",
     "mouseflow", "_lo", "Intercom", "Piwik", "Matomo", "openpanel", "__OPENREPLAY__",
     "_growthbook", "growthbook_config", "growthbook_queue", "LDClient", "Statsig"].forEach(function (n) { defStub(n, s); });
    ["dataLayer", "_paq", "_mtm"].forEach(function (n) { defStub(n, silentArray(n), true); });
  }
  M.installStubs = installStubs;

  var TRACK_HOST = /(^|\.)(posthog\.com|posthog\.io|amplitude\.com|mxpnl\.com|mixpanel\.com|segment\.(com|io)|segmentapis\.com|heapanalytics\.com|heap\.io|hotjar\.(com|io)|fullstory\.com|logrocket\.(io|com)|lr-ingest\.io|lr-in\.com|openreplay\.com|highlight\.io|clarity\.ms|mc\.yandex\.ru|plausible\.io|umami\.is|openpanel\.dev|rudderstack\.com|rudderlabs\.com|count\.ly|statsig\.com|matomo\.cloud|googletagmanager\.com|google-analytics\.com|analytics\.google\.com|sentry\.io|smartlook\.com|mouseflow\.com|inspectlet\.com|luckyorange\.com|crazyegg\.com|quantserve\.com|scorecardresearch\.com|pendo\.io|growthbook\.io|gb-ingest\.com|unleash-hosted\.com|highlight\.run)$/i;

  function isTracker(url) {
    try {
      var u = new URL(String(url), location.href), p = u.pathname, full = String(url);
      if (TRACK_HOST.test(u.hostname)) return true;
      if (/\/matomo\.php$|\/piwik\.php$/i.test(p)) return true;
      // PostHog / generic ingest paths only when a vendor hint is also present (avoids false positives).
      if (/\/(e|s|i\/v0\/e|batch|capture|decide|flags|array)(\/|\?|$)/i.test(p) && /posthog|ph_|__ph/i.test(full)) return true;
      return false;
    } catch (e) { return false; }
  }

  function fakeBody(url) {
    if (/growthbook|gb-ingest/i.test(String(url))) {
      // GrowthBook feature/tracking endpoints: empty feature set, no experiments.
      if (/\/api\/features|\/api\/eval|\/sub\//i.test(String(url))) return M.jsonStringify({ features: {}, experiments: [], dateUpdated: null });
      return M.jsonStringify({ status: 200 });
    }
    if (/decide|flags/i.test(String(url))) {
      return M.jsonStringify({
        config: { enable_collect_everything: false }, featureFlags: {}, featureFlagPayloads: {},
        errorsWhileComputingFlags: false, toolbarParams: {}, isAuthenticated: false, sessionRecording: false,
        supportedCompression: [], capturePerformance: false, autocapture_opt_out: true, autocaptureExceptions: false, siteApps: []
      });
    }
    return "";
  }

  M.hookMethod("analytics", window, "fetch", function (orig) {
    return function (input) {
      try {
        var url = input && input.url ? input.url : input;
        if (M.wanted("analytics") && isTracker(url)) {
          M.trigger("analytics");
          return Promise.resolve(new Response(fakeBody(url), { status: 200, headers: { "Content-Type": "application/json" } }));
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  });

  if (typeof XMLHttpRequest !== "undefined") {
    var trkXhr = new WeakMap();
    M.hookMethod("analytics", XMLHttpRequest.prototype, "open", function (orig) {
      return function (method, url) {
        try { if (M.wanted("analytics") && isTracker(url)) M.wmSet.call(trkXhr, this, String(url)); } catch (e) {}
        return orig.apply(this, arguments);
      };
    });
    M.hookMethod("analytics", XMLHttpRequest.prototype, "send", function (orig) {
      return function () {
        if (!M.wmHas.call(trkXhr, this)) return orig.apply(this, arguments);
        var self = this, body = fakeBody(M.wmGet.call(trkXhr, this));
        try {
          M.defProp(self, "readyState", { configurable: true, get: function () { return 4; } });
          M.defProp(self, "status", { configurable: true, get: function () { return 200; } });
          M.defProp(self, "responseText", { configurable: true, get: function () { return body; } });
          M.defProp(self, "response", { configurable: true, get: function () { return body; } });
        } catch (e) {}
        M.trigger("analytics");
        setTimeout(function () {
          ["readystatechange", "load", "loadend"].forEach(function (t) { try { self.dispatchEvent(new Event(t)); } catch (e) {} });
        }, 0);
      };
    });
  }

  if (NP) {
    M.hookMethod("beaconq", NP, "sendBeacon", function (orig) {
      return function (url) {
        if (M.grp("beacon")) { M.trigger("beacon"); return true; }
        if (M.wanted("analytics") && isTracker(url)) { M.trigger("analytics"); return true; }
        return orig.apply(this, arguments);
      };
    });
  }
})();
