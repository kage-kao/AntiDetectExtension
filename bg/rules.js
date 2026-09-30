// SW module: declarativeNetRequest state — static ruleset toggles, header rules,
// privacy rules (HTTPS upgrade, URL cleaning, AMP), user rules, browser privacy API.

var ALL_TYPES = ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "media", "websocket", "other"];
var SUB_TYPES = ALL_TYPES.filter(function (t) { return t !== "main_frame"; });
var FRAME_TYPES = ["main_frame", "sub_frame"];

var WHITELIST_RULE_OFFSET = 150000;
var RULE = { gpc: 99001, cookies: 99002, adtech: 99003, https: 99004, httpsLocal: 99005, httpsIp: 99006, httpsLabel: 99007, amp: 99008, ampCdn: 99009, fonts: 99010, cleanUrl: 99020 };
var LOCAL_TLDS = ["localhost", "local", "lan", "internal", "home", "test", "home.arpa", "intranet", "corp"];
var PRIO = { cleanUrl: 30, https: 40, httpsLocal: 45, httpFallback: 60, headers: 70 };

// Hosts that break without third-party cookies (SSO, captchas, payments).
var COOKIE_SAFE_HOSTS = ["accounts.google.com", "google.com", "gstatic.com", "recaptcha.net", "hcaptcha.com",
  "login.microsoftonline.com", "login.live.com", "appleid.apple.com", "paypal.com", "stripe.com", "stripe.network"];

var PERMISSIONS_POLICY = "browsing-topics=(), join-ad-interest-group=(), run-ad-auction=(), attribution-reporting=()";

function secChUa(profile) {
  var m = profile.brandMajor;
  var g = ADE_greaseBrand(m);
  return '"Chromium";v="' + m + '", "Google Chrome";v="' + m + '", "' + g.brand + '";v="' + g.version + '"';
}

function cleanHosts(list) {
  return list.map(function (h) { return String(h).trim().toLowerCase().replace(/^www\./, ""); })
    .filter(function (h) { return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(h); });
}

function headerRule(id, requestHeaders, responseHeaders, types, excluded) {
  var action = { type: "modifyHeaders" };
  if (requestHeaders.length) action.requestHeaders = requestHeaders;
  if (responseHeaders.length) action.responseHeaders = responseHeaders;
  return { id: id, priority: PRIO.headers, action: action,
    condition: { resourceTypes: types, excludedRequestDomains: excluded.length ? excluded : undefined } };
}

function headerRules(settings, profile) {
  if (!settings.enabled) return [];
  var excluded = cleanHosts((settings.whitelist || []).concat(ADE_BUILTIN_BYPASS_HOSTS));
  var rules = [];
  var ua = [];
  if (profile && settings.mode === "stable") {
    if (settings.groups.uach) {
      ua.push(
        { header: "User-Agent", operation: "set", value: profile.ua },
        { header: "Sec-CH-UA", operation: "set", value: secChUa(profile) },
        { header: "Sec-CH-UA-Mobile", operation: "set", value: "?0" },
        { header: "Sec-CH-UA-Platform", operation: "set", value: '"' + profile.uaPlatform + '"' }
      );
    }
    if (settings.groups.locale) ua.push({ header: "Accept-Language", operation: "set", value: profile.acceptLang });
    if (ua.length) rules.push(headerRule(ADE_HEADER_RULE_ID, ua, [], ALL_TYPES, excluded));
  }
  if (settings.gpc) {
    rules.push(headerRule(RULE.gpc, [{ header: "Sec-GPC", operation: "set", value: "1" }], [], ALL_TYPES, excluded));
  }
  if (settings.blockCookies3p) {
    var r = headerRule(RULE.cookies, [{ header: "Cookie", operation: "remove" }], [{ header: "Set-Cookie", operation: "remove" }],
      SUB_TYPES, excluded.concat(COOKIE_SAFE_HOSTS));
    r.condition.domainType = "thirdParty";
    rules.push(r);
  }
  if (settings.blockAdTopics) {
    rules.push(headerRule(RULE.adtech, [{ header: "Sec-Browsing-Topics", operation: "remove" }],
      [{ header: "Permissions-Policy", operation: "append", value: PERMISSIONS_POLICY }], ALL_TYPES, excluded));
  }
  return rules;
}

function privacyRules(settings) {
  if (!settings.enabled) return [];
  var rules = [];
  if (settings.httpsUpgrade) {
    rules.push({ id: RULE.https, priority: PRIO.https, action: { type: "upgradeScheme" },
      condition: { urlFilter: "|http://", resourceTypes: FRAME_TYPES } });
    [
      [RULE.httpsLocal, { requestDomains: LOCAL_TLDS }],
      [RULE.httpsIp, { regexFilter: "^http://(127|10|0|169\\.254|192\\.168|172\\.(1[6-9]|2[0-9]|3[01]))\\.|^http://\\[" }],
      [RULE.httpsLabel, { regexFilter: "^http://[a-zA-Z0-9-]+(:|/|$)" }]
    ].forEach(function (x) {
      x[1].resourceTypes = FRAME_TYPES;
      rules.push({ id: x[0], priority: PRIO.httpsLocal, action: { type: "allow" }, condition: x[1] });
    });
  }
  if (settings.blockRemoteFonts) {
    // uBlock-style "no remote fonts": third-party font files are a tracking vector.
    rules.push({ id: RULE.fonts, priority: 50, action: { type: "block" },
      condition: { resourceTypes: ["font"], domainType: "thirdParty",
        excludedRequestDomains: cleanHosts((settings.whitelist || []).concat(ADE_BUILTIN_BYPASS_HOSTS)) } });
  }
  if (settings.cleanUrls) {
    // RE2 rules are capped at 2KB compiled, so the param list is split into chunks.
    for (var i = 0, n = 0; i < ADE_TRACKING_PARAMS.length; i += 8, n++) {
      rules.push({ id: RULE.cleanUrl + n, priority: PRIO.cleanUrl,
        action: { type: "redirect", redirect: { transform: { queryTransform: { removeParams: ADE_TRACKING_PARAMS } } } },
        condition: { regexFilter: "[?&](" + ADE_TRACKING_PARAMS.slice(i, i + 8).join("|") + ")=", isUrlFilterCaseSensitive: true, resourceTypes: ["main_frame", "sub_frame"] } });
    }
  }
  if (settings.ampRedirect) {
    rules.push({ id: RULE.amp, priority: PRIO.cleanUrl, action: { type: "redirect", redirect: { regexSubstitution: "https://\\1" } },
      condition: { regexFilter: "^https?://(?:www\\.)?google\\.[a-z.]+/amp/s/(.+)$", resourceTypes: ["main_frame"] } });
    rules.push({ id: RULE.ampCdn, priority: PRIO.cleanUrl, action: { type: "redirect", redirect: { regexSubstitution: "https://\\1" } },
      condition: { regexFilter: "^https?://[a-z0-9-]+\\.cdn\\.ampproject\\.org/(?:[a-z]/)+s/(.+)$", resourceTypes: ["main_frame"] } });
  }
  return rules;
}

function chromeSetting(setting, value) {
  return new Promise(function (resolve) {
    if (!setting) return resolve();
    try {
      if (value === null) setting.clear({}, function () { void chrome.runtime.lastError; resolve(); });
      else setting.set({ value: value }, function () { void chrome.runtime.lastError; resolve(); });
    } catch (e) { resolve(); }
  });
}

// Browser-level switches that sites can't detect: Privacy Sandbox ad APIs + WebRTC IP policy.
function applyPrivacyApi(settings) {
  var p = chrome.privacy;
  if (!p) return Promise.resolve();
  var adOff = settings.enabled && settings.blockAdTopics ? false : null;
  var w = p.websites || {};
  var rtc = settings.enabled && settings.groups.webrtc ? "disable_non_proxied_udp" : null;
  return Promise.all([
    chromeSetting(w.topicsEnabled, adOff),
    chromeSetting(w.fledgeEnabled, adOff),
    chromeSetting(w.adMeasurementEnabled, adOff),
    chromeSetting(p.network && p.network.webRTCIPHandlingPolicy, rtc)
  ]);
}

// Rebuilds the whole dynamic DNR state from settings. Serialized through `enqueue` (init.js).
function applyDynamicState(settings) {
  var before = settings.activeProfileId;
  var profile = adeEnsureProfile(settings);
  var persist = (settings.activeProfileId !== before) ? adeSetSettings(settings) : Promise.resolve();
  var on = settings.enabled;
  var sets = { ads: on && settings.blockAds, trackers: on && settings.blockTrackers, analytics: on && settings.blockTrackers,
    annoyances: on && settings.blockAnnoyances, social: on && settings.blockSocial, security: on && settings.blockSecurity };
  var ids = Object.keys(sets);
  return persist.then(function () {
    return chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: ids.filter(function (id) { return sets[id]; }),
      disableRulesetIds: ids.filter(function (id) { return !sets[id]; })
    });
  }).then(function () {
    return applyPrivacyApi(settings);
  }).then(function () {
    return chrome.declarativeNetRequest.getDynamicRules();
  }).then(function (old) {
    var addRules = headerRules(settings, profile).concat(privacyRules(settings));
    var id = ADE_DYNAMIC_RULE_OFFSET;
    if (settings.enabled) {
      (settings.userBlockDomains || []).forEach(function (dom) {
        var d = String(dom).trim().replace(/^\|+/, "").replace(/\^+$/, "");
        if (!d) return;
        addRules.push({ id: id++, priority: 1, action: { type: "block" }, condition: { urlFilter: "||" + d + "^", resourceTypes: ALL_TYPES } });
      });
    }
    id = WHITELIST_RULE_OFFSET;
    (settings.whitelist || []).forEach(function (host) {
      var h = String(host).replace(/^www\./, "").trim();
      if (!h) return;
      addRules.push({ id: id++, priority: 100, action: { type: "allowAllRequests" }, condition: { urlFilter: "||" + h + "^", resourceTypes: FRAME_TYPES } });
    });
    var removeRuleIds = old.map(function (r) { return r.id; });
    return chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeRuleIds, addRules: addRules }).catch(function (e) {
      // One bad rule (e.g. a malformed user domain) must not drop all the others.
      console.warn("[ADE rules]", e);
      return chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeRuleIds, addRules: [] }).then(function () {
        return Promise.all(addRules.map(function (r) {
          return chrome.declarativeNetRequest.updateDynamicRules({ addRules: [r] }).catch(function (err) { console.warn("[ADE rule " + r.id + "]", err.message); });
        }));
      });
    });
  });
}

// ---------- HTTPS upgrade fallback: if the upgraded site fails, allow http for it ----------
var httpPending = {};
var HTTPS_FAIL = /ERR_(SSL|CERT|BAD_SSL|CONNECTION_(REFUSED|RESET|CLOSED|TIMED_OUT)|TIMED_OUT|TOO_MANY_REDIRECTS|EMPTY_RESPONSE)/;

function allowHttp(host) {
  return chrome.declarativeNetRequest.getSessionRules().then(function (rules) {
    if (rules.some(function (r) { return (r.condition.requestDomains || [])[0] === host; })) return null;
    // Keep fallback ids below the badger slice (160000+, see bg/badger.js): badger
    // rebuilds wipe everything in its range and stats count it as blocked.
    var id = rules.reduce(function (m, r) { return r.id < 160000 ? Math.max(m, r.id) : m; }, 0) + 1;
    return chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{ id: id, priority: PRIO.httpFallback, action: { type: "allow" },
        condition: { urlFilter: "|http://", requestDomains: [host], resourceTypes: FRAME_TYPES } }]
    });
  });
}

chrome.webNavigation.onCommitted.addListener(function (d) {
  if (d.frameId === 0) delete httpPending[d.tabId];
});

chrome.webNavigation.onErrorOccurred.addListener(function (d) {
  if (d.frameId !== 0) return;
  var orig = httpPending[d.tabId];
  if (!orig || !/^https:\/\//.test(d.url) || !HTTPS_FAIL.test(d.error || "")) return;
  var host;
  try { host = new URL(orig).hostname; if (new URL(d.url).hostname !== host) return; } catch (e) { return; }
  delete httpPending[d.tabId];
  allowHttp(host).then(function () { return chrome.tabs.update(d.tabId, { url: orig }); }).catch(function (e) { console.warn("[ADE https]", e); });
});
