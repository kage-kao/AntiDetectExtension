// Service worker: storage -> DNR rulesets + header/privacy rules + MAIN-world registration + per-tab reports.

importScripts("common.js", "profiles.js", "trackers-db.js");

var MAIN_ID = "ade-main";
var GROUP_KEYS = Object.keys(ADE_DEFAULTS.groups);
var STATIC_SETS = ["ads", "trackers", "analytics"];
var DEBUG_MATCH = !!chrome.declarativeNetRequest.onRuleMatchedDebug;
var ALL_TYPES = ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "media", "websocket", "other"];
var SUB_TYPES = ALL_TYPES.filter(function (t) { return t !== "main_frame"; });
var FRAME_TYPES = ["main_frame", "sub_frame"];

var WHITELIST_RULE_OFFSET = 150000;
var RULE = { gpc: 99001, cookies: 99002, adtech: 99003, https: 99004, httpsLocal: 99005, httpsIp: 99006, httpsLabel: 99007, amp: 99008, ampCdn: 99009, cleanUrl: 99020 };
var LOCAL_TLDS = ["localhost", "local", "lan", "internal", "home", "test", "home.arpa", "intranet", "corp"];
var PRIO = { cleanUrl: 30, https: 40, httpsLocal: 45, httpFallback: 60, headers: 70 };

// Hosts that break without third-party cookies (SSO, captchas, payments).
var COOKIE_SAFE_HOSTS = ["accounts.google.com", "google.com", "gstatic.com", "recaptcha.net", "hcaptcha.com",
  "login.microsoftonline.com", "login.live.com", "appleid.apple.com", "paypal.com", "stripe.com", "stripe.network"];

var PERMISSIONS_POLICY = "browsing-topics=(), join-ad-interest-group=(), run-ad-auction=(), attribution-reporting=()";

// ---------- per-tab stats (persisted in storage.session so SW restarts keep them) ----------
var tabStats = {};
var statsReady = chrome.storage.session.get("adeTabStats").then(function (d) {
  var saved = (d && d.adeTabStats) || {};
  Object.keys(saved).forEach(function (k) { if (!tabStats[k]) tabStats[k] = saved[k]; });
}).catch(function () {});
var saveTimer = null;
function saveStats() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () { chrome.storage.session.set({ adeTabStats: tabStats }).catch(function () {}); }, 400);
}
function freshStats(ts) { return { blocked: 0, spoof: 0, navStart: ts || Date.now(), domains: {}, seen: {} }; }
function statsFor(tabId) { return tabStats[tabId] || (tabStats[tabId] = freshStats()); }

// Packed builds have no onRuleMatchedDebug: Chrome shows the blocked-count badge itself.
chrome.action.setBadgeBackgroundColor({ color: "#b00020" }).catch(function () {});
if (!DEBUG_MATCH && chrome.declarativeNetRequest.setExtensionActionOptions) {
  chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true }).catch(function () {});
}

function setBadge(tabId) {
  if (!DEBUG_MATCH) return;
  var s = tabStats[tabId] || { blocked: 0, spoof: 0 };
  var total = s.blocked + s.spoof;
  chrome.action.setBadgeText({ tabId: tabId, text: total > 0 ? (total > 999 ? "999+" : String(total)) : "" }).catch(function () {});
}

function bump(tabId, kind, domain) {
  if (tabId < 0) return;
  var s = statsFor(tabId);
  s[kind]++;
  if (domain) s.domains[domain] = (s.domains[domain] || 0) + 1;
  setBadge(tabId);
  saveStats();
}

function isBlockRule(rulesetId, ruleId) {
  if (STATIC_SETS.indexOf(rulesetId) >= 0) return true;
  return rulesetId === "_dynamic" && ruleId >= ADE_DYNAMIC_RULE_OFFSET && ruleId < WHITELIST_RULE_OFFSET;
}

if (DEBUG_MATCH) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(function (info) {
    var tabId = info.request && info.request.tabId;
    if (typeof tabId !== "number" || tabId < 0 || !isBlockRule(info.rule.rulesetId, info.rule.ruleId)) return;
    var host = "";
    try { host = new URL(info.request.url).hostname.replace(/^www\./, ""); } catch (e) {}
    bump(tabId, "blocked", host);
  });
}

var ruleDomains = null;
function loadRuleDomains() {
  if (ruleDomains) return Promise.resolve(ruleDomains);
  return Promise.all(STATIC_SETS.map(function (id) {
    return fetch(chrome.runtime.getURL("rules/rules_" + id + ".json")).then(function (r) { return r.json(); }).then(function (rules) {
      return rules.map(function (r) { return [id + ":" + r.id, adeDomainFromFilter(r.condition.urlFilter)]; });
    });
  })).then(function (lists) {
    var m = {};
    lists.forEach(function (l) { l.forEach(function (p) { m[p[0]] = p[1]; }); });
    ruleDomains = m;
    return m;
  });
}

// Packed mode: pull matched rules (DNR feedback) and merge them into the tab stats without double counting.
function buildReport(tabId) {
  return statsReady.then(function () {
    var s = statsFor(tabId);
    if (DEBUG_MATCH) return s;
    return Promise.all([loadRuleDomains(), chrome.declarativeNetRequest.getDynamicRules()]).then(function (res) {
      var map = res[0], dyn = {};
      res[1].forEach(function (r) { if (r.condition && r.condition.urlFilter) dyn[r.id] = adeDomainFromFilter(r.condition.urlFilter); });
      return chrome.declarativeNetRequest.getMatchedRules({ tabId: tabId, minTimeStamp: s.navStart }).then(function (info) {
        (info.rulesMatchedInfo || []).forEach(function (m) {
          var r = m.rule;
          if (!isBlockRule(r.rulesetId, r.ruleId)) return;
          var key = r.rulesetId + ":" + r.ruleId + ":" + m.timeStamp;
          if (s.seen[key]) return;
          s.seen[key] = 1;
          s.blocked++;
          var dom = r.rulesetId === "_dynamic" ? dyn[r.ruleId] : map[r.rulesetId + ":" + r.ruleId];
          if (dom) s.domains[dom] = (s.domains[dom] || 0) + 1;
        });
        saveStats();
        return s;
      });
    }).catch(function () { return s; });
  });
}

// ---------- navigation: stats reset + HTTPS upgrade fallback ----------
var httpPending = {};
var HTTPS_FAIL = /ERR_(SSL|CERT|BAD_SSL|CONNECTION_(REFUSED|RESET|CLOSED|TIMED_OUT)|TIMED_OUT|TOO_MANY_REDIRECTS|EMPTY_RESPONSE)/;

chrome.webNavigation.onBeforeNavigate.addListener(function (d) {
  if (d.frameId !== 0) return;
  tabStats[d.tabId] = freshStats(Math.floor(d.timeStamp));
  setBadge(d.tabId);
  saveStats();
  if (/^http:\/\//.test(d.url)) httpPending[d.tabId] = d.url; else delete httpPending[d.tabId];
});

chrome.webNavigation.onCommitted.addListener(function (d) {
  if (d.frameId === 0) delete httpPending[d.tabId];
});

function allowHttp(host) {
  return chrome.declarativeNetRequest.getSessionRules().then(function (rules) {
    if (rules.some(function (r) { return (r.condition.requestDomains || [])[0] === host; })) return null;
    var id = rules.reduce(function (m, r) { return Math.max(m, r.id); }, 0) + 1;
    return chrome.declarativeNetRequest.updateSessionRules({
      addRules: [{ id: id, priority: PRIO.httpFallback, action: { type: "allow" },
        condition: { urlFilter: "|http://", requestDomains: [host], resourceTypes: FRAME_TYPES } }]
    });
  });
}

chrome.webNavigation.onErrorOccurred.addListener(function (d) {
  if (d.frameId !== 0) return;
  var orig = httpPending[d.tabId];
  if (!orig || !/^https:\/\//.test(d.url) || !HTTPS_FAIL.test(d.error || "")) return;
  var host;
  try { host = new URL(orig).hostname; if (new URL(d.url).hostname !== host) return; } catch (e) { return; }
  delete httpPending[d.tabId];
  allowHttp(host).then(function () { return chrome.tabs.update(d.tabId, { url: orig }); }).catch(function (e) { console.warn("[ADE https]", e); });
});

// ---------- messages ----------
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;
  if (msg.type === "ade-trigger") {
    var tabId = sender.tab && sender.tab.id;
    if (typeof tabId === "number") bump(tabId, "spoof");
    return;
  }
  if (msg.type === "ade-report" || msg.type === "ade-get-stats") {
    buildReport(msg.tabId).then(function (s) { sendResponse({ blocked: s.blocked, spoof: s.spoof, domains: s.domains }); });
    return true;
  }
  if (msg.type === "ade-site-legend") {
    siteLegend(adeSiteKey(msg.site)).then(function (l) { sendResponse({ legend: l || null }); }, function () { sendResponse({ legend: null }); });
    return true;
  }
  if (msg.type === "ade-burn-all") {
    // Fire button: wipe absolutely everything (except downloads), reset the extension
    // to a fresh identity, then close every tab in every window.
    var removalTypes = {
      cache: true, cacheStorage: true, cookies: true, fileSystems: true,
      formData: true, history: true, indexedDB: true, localStorage: true,
      passwords: true, serviceWorkers: true, webSQL: true
    };
    Promise.resolve()
      .then(function () { return chrome.browsingData.remove({ since: 0 }, removalTypes).catch(function (e) { console.warn("[ADE burn-all]", e); }); })
      .then(function () { return Promise.all([
        chrome.storage.local.clear().catch(function () {}),
        chrome.storage.session.clear().catch(function () {})
      ]); })
      .then(function () { sendResponse({ ok: true }); })
      .then(function () { return chrome.tabs.query({}); })
      .then(function (tabs) {
        var ids = (tabs || []).map(function (t) { return t.id; }).filter(function (id) { return typeof id === "number"; });
        if (ids.length) return chrome.tabs.remove(ids).catch(function () {});
      })
      .catch(function () { try { sendResponse({ ok: false }); } catch (e) {} });
    return true;
  }
});

// ---------- DNR dynamic state ----------
var chain = Promise.resolve();
function enqueue(fn) {
  chain = chain.then(fn).catch(function (e) { console.warn("[ADE]", e); });
  return chain;
}

function secChUa(profile) {
  var m = profile.brandMajor;
  return '"Chromium";v="' + m + '", "Google Chrome";v="' + m + '", "Not-A.Brand";v="24"';
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
  if (settings.cleanUrls) {
    // RE2 rules are capped at 2KB compiled, so the param list is split into chunks.
    for (var i = 0, n = 0; i < ADE_TRACKING_PARAMS.length; i += 8, n++) {
      rules.push({ id: RULE.cleanUrl + n, priority: PRIO.cleanUrl,
        action: { type: "redirect", redirect: { transform: { queryTransform: { removeParams: ADE_TRACKING_PARAMS } } } },
        condition: { regexFilter: "[?&](" + ADE_TRACKING_PARAMS.slice(i, i + 8).join("|") + ")=", isUrlFilterCaseSensitive: true, resourceTypes: ["main_frame"] } });
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

function applyDynamicState(settings) {
  var before = settings.activeProfileId;
  var profile = adeEnsureProfile(settings);
  var persist = (settings.activeProfileId !== before) ? adeSetSettings(settings) : Promise.resolve();
  var ads = settings.enabled && settings.blockAds, trk = settings.enabled && settings.blockTrackers;
  return persist.then(function () {
    return chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [ads && "ads", trk && "trackers", trk && "analytics"].filter(Boolean),
      disableRulesetIds: [!ads && "ads", !trk && "trackers", !trk && "analytics"].filter(Boolean)
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

// ---------- MAIN-world script ----------
function mainFlags(settings) {
  var out = GROUP_KEYS.filter(function (k) { return settings.groups[k]; });
  if (settings.gpc) out.push("gpc");
  if (settings.blockAdTopics) out.push("adtech");
  return out;
}

function mainFiles(settings) {
  var files = ["profiles.js", "content/flags/on.js"];
  mainFlags(settings).forEach(function (k) { files.push("content/flags/" + k + ".js"); });
  files.push("content/inject.js");
  return files;
}

function excludePatterns(settings) {
  var out = [];
  cleanHosts((settings.whitelist || []).concat(ADE_BUILTIN_BYPASS_HOSTS)).forEach(function (d) {
    out.push("*://" + d + "/*", "*://*." + d + "/*");
  });
  return out;
}

function syncMainScript(settings) {
  return chrome.scripting.getRegisteredContentScripts({ ids: [MAIN_ID] }).then(function (existing) {
    if (!settings.enabled) {
      if (existing.length) return chrome.scripting.unregisterContentScripts({ ids: [MAIN_ID] });
      return null;
    }
    var script = {
      id: MAIN_ID, js: mainFiles(settings), matches: ["<all_urls>"], excludeMatches: excludePatterns(settings),
      runAt: "document_start", allFrames: true, matchOriginAsFallback: true, world: "MAIN", persistAcrossSessions: true
    };
    if (existing.length) return chrome.scripting.updateContentScripts([script]);
    return chrome.scripting.registerContentScripts([script]);
  });
}

function frameEffectiveUrl(frame, byId) {
  var f = frame;
  while (f && !/^(https?|file):/.test(f.url) && f.parentFrameId >= 0) f = byId[f.parentFrameId];
  return f ? f.url : "";
}

function frameProtected(settings, url) {
  var u;
  try { u = new URL(url); } catch (e) { return false; }
  if (!/^(https?|file):$/.test(u.protocol)) return false;
  var host = u.hostname.replace(/^www\./, "");
  if (adeIsWhitelisted(settings, host) || adeIsBuiltinBypass(host)) return false;
  return !/\/cdn-cgi\/challenge-platform\//.test(u.pathname);
}

function injectOpenTabs(settings, withBridge) {
  return chrome.tabs.query({ url: ["http://*/*", "https://*/*", "file:///*"] }).then(function (tabs) {
    var files = mainFiles(settings);
    return Promise.all(tabs.map(function (tab) {
      var p = Promise.resolve();
      if (withBridge) {
        p = p.then(function () {
          return chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["common.js", "content/bridge.js"] }).catch(function () {});
        });
      }
      if (!settings.enabled) return p;
      return p.then(function () {
        return chrome.webNavigation.getAllFrames({ tabId: tab.id }).catch(function () { return null; });
      }).then(function (frames) {
        if (!frames) return null;
        var byId = {};
        frames.forEach(function (f) { byId[f.frameId] = f; });
        return Promise.all(frames
          .filter(function (f) { return frameProtected(settings, frameEffectiveUrl(f, byId)); })
          .map(function (f) {
            return chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [f.frameId] }, files: files, world: "MAIN", injectImmediately: true }).catch(function () {});
          }));
      });
    }));
  });
}

function broadcast(settings) {
  return chrome.tabs.query({}).then(function (tabs) {
    tabs.forEach(function (t) {
      chrome.tabs.sendMessage(t.id, { type: "SETTINGS_UPDATED", settings: settings }).catch(function () {});
    });
  });
}

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "local" || !changes.settings) return;
  var prev = adeMergeDefaults(changes.settings.oldValue);
  var next = adeMergeDefaults(changes.settings.newValue);
  enqueue(function () {
    return applyDynamicState(next).then(function () {
      return syncMainScript(next);
    }).then(function () {
      return broadcast(next);
    }).then(function () {
      var unWhitelisted = (prev.whitelist || []).some(function (w) { return (next.whitelist || []).indexOf(w) < 0; });
      var had = mainFlags(prev);
      var flagsGrew = mainFlags(next).some(function (k) { return had.indexOf(k) < 0; });
      if (next.enabled && (!prev.enabled || unWhitelisted || flagsGrew)) return injectOpenTabs(next, false);
      return null;
    });
  });
});

chrome.runtime.onInstalled.addListener(function (details) {
  enqueue(function () {
    return adeGetSettings().then(function (settings) {
      adeEnsureProfile(settings);
      if (details && details.reason === "update" && settings.rotateIdentity === "session") settings.rotateIdentity = "site";
      return adeSetSettings(settings);
    }).then(function () {
      return adeGetSettings();
    }).then(function (settings) {
      return applyDynamicState(settings).then(function () {
        return syncMainScript(settings);
      }).then(function () {
        return injectOpenTabs(settings, true);
      });
    });
  });
});

enqueue(function () {
  return adeGetSettings().then(function (settings) {
    return applyDynamicState(settings).then(function () {
      return syncMainScript(settings);
    });
  });
});

// New browser session (or new day): rotate the stable legend so returning visits get a fresh
// fingerprint without a Chrome reinstall. Persisting settings fires storage.onChanged, which
// re-applies header rules and broadcasts the new legend to any already-open tabs.
chrome.runtime.onStartup.addListener(function () {
  enqueue(function () {
    return adeGetSettings().then(function (settings) {
      if (!settings.enabled || settings.mode !== "stable" || !adeRotationDue(settings)) return null;
      adeRotateProfile(settings);
      return adeSetSettings(settings);
    });
  });
});

// ---------- per-site legends: live while any tab of the site is open (storage.session) ----------
var SITE_KEY = "adeSiteLegends";
var siteChain = Promise.resolve();
function siteQueue(fn) {
  var p = siteChain.then(fn);
  siteChain = p.catch(function (e) { console.warn("[ADE site]", e); });
  return p;
}
function loadSites() {
  return chrome.storage.session.get(SITE_KEY).then(function (d) { return (d && d[SITE_KEY]) || {}; });
}
function saveSites(map) {
  var o = {};
  o[SITE_KEY] = map;
  return chrome.storage.session.set(o);
}
function tabSite(tab) {
  var url = tab.url || tab.pendingUrl || "";
  return /^(https?|file):/.test(url) ? adeSiteKey(adeHostFromUrl(url)) : "";
}

function siteLegend(site) {
  return siteQueue(function () {
    return adeGetSettings().then(function (s) {
      var base = adeActiveProfile(s);
      if (!base || !site) return base;
      return loadSites().then(function (map) {
        var cur = map[site];
        if (cur && cur.base === base.id) return cur;
        var fresh = adeSiteLegend(base);
        if (!fresh) return base;
        map[site] = fresh;
        return saveSites(map).then(function () { return fresh; });
      });
    });
  });
}

// Last tab of a site closed (or navigated away): its legend is dropped, the next visit gets a new one.
function dropUnusedSites() {
  return siteQueue(function () {
    return Promise.all([loadSites(), chrome.tabs.query({})]).then(function (r) {
      var map = r[0], live = {}, changed = false;
      r[1].forEach(function (t) { var k = tabSite(t); if (k) live[k] = 1; });
      Object.keys(map).forEach(function (k) { if (!live[k]) { delete map[k]; changed = true; } });
      return changed ? saveSites(map) : null;
    });
  });
}

chrome.tabs.onUpdated.addListener(function (tabId, info) {
  if (info.url) dropUnusedSites();
});
chrome.tabs.onRemoved.addListener(function () { dropUnusedSites(); });

// ---------- forget sites / fire button ----------
function originOf(url) {
  try { var u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : ""; } catch (e) { return ""; }
}

var ADE_FORGET_TYPES = {
  cookies: true, localStorage: true, indexedDB: true, cacheStorage: true,
  serviceWorkers: true, fileSystems: true, cache: true, webSQL: true
};

var forgetChain = Promise.resolve();
function forgetQueue(fn) {
  forgetChain = forgetChain.then(fn).catch(function (e) { console.warn("[ADE forget]", e); });
}

// http/https × host/www.host × exact port — all wiped together.
// Ports matter: chrome.browsingData keys web-storage/IndexedDB/SW/CacheStorage by full origin
// (scheme + host + port), so a site served on a non-standard port (e.g. :8899) survived the
// wipe when the port was dropped. We now emit every scheme/host variant at the real port AND
// at the default port so storage set under either is cleared.
function siblingOrigins(origin) {
  var out = [], seen = {};
  function add(o) { if (o && !seen[o]) { seen[o] = 1; out.push(o); } }
  try {
    var u = new URL(origin);
    if (!/^https?:$/.test(u.protocol)) return [];
    var host = u.hostname.replace(/^www\./, "");
    var port = u.port; // "" when default
    ["https:", "http:"].forEach(function (proto) {
      [host, "www." + host].forEach(function (h) {
        add(proto + "//" + h);                    // default port
        if (port) add(proto + "//" + h + ":" + port); // explicit non-standard port
      });
    });
  } catch (e) {}
  return out;
}

function wipeOrigin(origin) {
  var origins = siblingOrigins(origin);
  if (!origins.length) return Promise.resolve();
  return chrome.browsingData.remove({ origins: origins }, ADE_FORGET_TYPES).catch(function (e) {
    console.warn("[ADE wipe]", origin, e);
  });
}

function loadPersistedOrigins() {
  return chrome.storage.local.get("adeTabOrigins").then(function (d) { return d.adeTabOrigins || {}; });
}
function savePersistedOrigins(map) {
  return chrome.storage.local.set({ adeTabOrigins: map });
}

function forgetIfUnused(origin) {
  if (!origin) return Promise.resolve();
  return adeGetSettings().then(function (s) {
    if (!s.enabled || !s.forgetSites) return null;
    var host = adeHostFromUrl(origin);
    if (adeIsWhitelisted(s, host) || adeIsBuiltinBypass(host)) return null;
    return chrome.tabs.query({}).then(function (tabs) {
      var stillUsed = tabs.some(function (t) { return originOf(t.url || t.pendingUrl || "") === origin; });
      return stillUsed ? null : wipeOrigin(origin);
    });
  });
}

chrome.tabs.onUpdated.addListener(function (tabId, info) {
  if (!info.url) return;
  forgetQueue(function () {
    return loadPersistedOrigins().then(function (map) {
      var prev = map[tabId], cur = originOf(info.url);
      if (cur) map[tabId] = cur; else delete map[tabId];
      return savePersistedOrigins(map).then(function () {
        if (prev && prev !== cur) return forgetIfUnused(prev);
        return null;
      });
    });
  });
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete tabStats[tabId];
  delete httpPending[tabId];
  saveStats();
  forgetQueue(function () {
    return loadPersistedOrigins().then(function (map) {
      var prev = map[tabId];
      delete map[tabId];
      return savePersistedOrigins(map).then(function () { return forgetIfUnused(prev); });
    });
  });
});

// Browser was closed with tabs open: wipe origins from the last session that aren't open now.
chrome.runtime.onStartup.addListener(function () {
  forgetQueue(function () {
    return adeGetSettings().then(function (s) {
      if (!s.enabled || !s.forgetSites) return savePersistedOrigins({});
      return loadPersistedOrigins().then(function (map) {
        var prevOrigins = {};
        Object.keys(map).forEach(function (k) { if (map[k]) prevOrigins[map[k]] = 1; });
        return chrome.tabs.query({}).then(function (tabs) {
          var live = {};
          tabs.forEach(function (t) { var o = originOf(t.url || t.pendingUrl || ""); if (o) live[o] = 1; });
          var toWipe = Object.keys(prevOrigins).filter(function (o) { return !live[o]; });
          return Promise.all(toWipe.map(function (o) {
            var host = adeHostFromUrl(o);
            if (adeIsWhitelisted(s, host) || adeIsBuiltinBypass(host)) return null;
            return wipeOrigin(o);
          })).then(function () {
            var next = {};
            tabs.forEach(function (t) { var o = originOf(t.url || ""); if (o) next[t.id] = o; });
            return savePersistedOrigins(next);
          });
        });
      });
    });
  });
});

forgetQueue(function () {
  return loadPersistedOrigins().then(function (map) {
    return chrome.tabs.query({}).then(function (tabs) {
      var live = {};
      tabs.forEach(function (t) { var o = originOf(t.url || ""); if (o) live[t.id] = o; });
      Object.keys(map).forEach(function (k) { if (!(k in live)) delete map[k]; });
      Object.keys(live).forEach(function (k) { map[k] = live[k]; });
      return savePersistedOrigins(map);
    });
  });
});
