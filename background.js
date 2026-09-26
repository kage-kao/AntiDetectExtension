// Service worker: storage -> DNR rulesets + UA-CH/Accept-Language headers + MAIN-world registration.

importScripts("common.js", "profiles.js");

var MAIN_ID = "ade-main";
var GROUP_KEYS = Object.keys(ADE_DEFAULTS.groups);
var tabStats = {};

function setBadge(tabId) {
  var s = tabStats[tabId] || { blocked: 0, spoof: 0 };
  var total = s.blocked + s.spoof;
  chrome.action.setBadgeText({ tabId: tabId, text: total > 0 ? (total > 999 ? "999+" : String(total)) : "" }).catch(function () {});
  chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: "#fd1d1e" }).catch(function () {});
}

function bump(tabId, kind) {
  if (tabId < 0) return;
  if (!tabStats[tabId]) tabStats[tabId] = { blocked: 0, spoof: 0 };
  tabStats[tabId][kind]++;
  setBadge(tabId);
}

if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(function (info) {
    var tabId = info.request && info.request.tabId;
    if (typeof tabId === "number" && tabId >= 0) bump(tabId, "blocked");
  });
}

chrome.webNavigation.onBeforeNavigate.addListener(function (d) {
  if (d.frameId === 0) {
    tabStats[d.tabId] = { blocked: 0, spoof: 0 };
    setBadge(d.tabId);
  }
});

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;
  if (msg.type === "ade-trigger") {
    var tabId = sender.tab && sender.tab.id;
    if (typeof tabId === "number") bump(tabId, "spoof");
    return;
  }
  if (msg.type === "ade-get-stats") {
    sendResponse(tabStats[msg.tabId] || { blocked: 0, spoof: 0 });
  }
});

var chain = Promise.resolve();
function enqueue(fn) {
  chain = chain.then(fn).catch(function (e) { console.warn("[ADE]", e); });
  return chain;
}

function secChUa(profile) {
  var m = profile.brandMajor;
  return '"Chromium";v="' + m + '", "Google Chrome";v="' + m + '", "Not-A.Brand";v="24"';
}

function headerRules(settings, profile) {
  if (!settings.enabled || !profile || settings.mode !== "stable") return [];
  var excluded = (settings.whitelist || []).concat(ADE_BUILTIN_BYPASS_HOSTS)
    .map(function (h) { return String(h).trim().toLowerCase().replace(/^www\./, ""); })
    .filter(function (h) { return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(h); });
  var headers = [];
  if (settings.groups.uach) {
    headers.push(
      { header: "User-Agent", operation: "set", value: profile.ua },
      { header: "Sec-CH-UA", operation: "set", value: secChUa(profile) },
      { header: "Sec-CH-UA-Mobile", operation: "set", value: "?0" },
      { header: "Sec-CH-UA-Platform", operation: "set", value: '"' + profile.uaPlatform + '"' }
    );
  }
  if (settings.groups.locale) {
    headers.push({ header: "Accept-Language", operation: "set", value: profile.acceptLang });
  }
  if (!headers.length) return [];
  return [{
    id: ADE_HEADER_RULE_ID,
    priority: 50,
    action: {
      type: "modifyHeaders",
      requestHeaders: headers
    },
    condition: {
      urlFilter: "*",
      resourceTypes: ["main_frame", "sub_frame", "stylesheet", "script", "image", "font", "object", "xmlhttprequest", "ping", "media", "websocket", "other"],
      excludedRequestDomains: excluded.length ? excluded : undefined
    }
  }];
}

function applyDynamicState(settings) {
  var before = settings.activeProfileId;
  var profile = adeEnsureProfile(settings);
  var persist = (settings.activeProfileId !== before) ? adeSetSettings(settings) : Promise.resolve();
  return persist.then(function () {
    return chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds: [settings.enabled && settings.blockAds && "ads", settings.enabled && settings.blockTrackers && "trackers"].filter(Boolean),
      disableRulesetIds: [!(settings.enabled && settings.blockAds) && "ads", !(settings.enabled && settings.blockTrackers) && "trackers"].filter(Boolean)
    });
  }).then(function () {
    return chrome.declarativeNetRequest.getDynamicRules();
  }).then(function (old) {
    var addRules = headerRules(settings, profile);
    var id = ADE_DYNAMIC_RULE_OFFSET;
    if (settings.enabled) {
      (settings.userBlockDomains || []).forEach(function (dom) {
        var d = String(dom).trim().replace(/^\|+/, "").replace(/\^+$/, "");
        if (!d) return;
        addRules.push({
          id: id++, priority: 1, action: { type: "block" },
          condition: {
            urlFilter: "||" + d + "^",
            resourceTypes: ["main_frame", "sub_frame", "script", "image", "xmlhttprequest", "stylesheet", "object", "ping", "media", "websocket", "font", "other"]
          }
        });
      });
    }
    (settings.whitelist || []).forEach(function (host) {
      var h = String(host).replace(/^www\./, "").trim();
      if (!h) return;
      addRules.push({
        id: id++, priority: 100, action: { type: "allowAllRequests" },
        condition: { urlFilter: "||" + h + "^", resourceTypes: ["main_frame", "sub_frame"] }
      });
    });
    var removeRuleIds = old.map(function (r) { return r.id; });
    return chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeRuleIds, addRules: addRules }).catch(function () {
      return chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeRuleIds, addRules: [] });
    });
  });
}

function mainFiles(settings) {
  var files = ["profiles.js"];
  GROUP_KEYS.forEach(function (k) { if (settings.groups[k]) files.push("content/flags/" + k + ".js"); });
  files.push("content/inject.js");
  return files;
}

function excludePatterns(settings) {
  var out = [];
  (settings.whitelist || []).concat(ADE_BUILTIN_BYPASS_HOSTS).forEach(function (h) {
    var d = String(h).trim().toLowerCase().replace(/^www\./, "");
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(d)) return;
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
      var groupsGrew = GROUP_KEYS.some(function (k) { return next.groups[k] && !prev.groups[k]; });
      if (next.enabled && (!prev.enabled || unWhitelisted || groupsGrew)) return injectOpenTabs(next, false);
      return null;
    });
  });
});

chrome.runtime.onInstalled.addListener(function () {
  enqueue(function () {
    return adeGetSettings().then(function (settings) {
      adeEnsureProfile(settings);
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

function originOf(url) {
  try { var u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : ""; } catch (e) { return ""; }
}
function siteOf(origin) {
  return adeHostFromUrl(origin).split(".").slice(-2).join(".");
}

var forgetChain = Promise.resolve();
function forgetQueue(fn) {
  forgetChain = forgetChain.then(fn).catch(function (e) { console.warn("[ADE forget]", e); });
}

function forgetIfUnused(origin) {
  if (!origin) return Promise.resolve();
  return adeGetSettings().then(function (s) {
    if (!s.enabled || !s.forgetSites || adeIsWhitelisted(s, adeHostFromUrl(origin))) return null;
    return chrome.tabs.query({}).then(function (tabs) {
      var site = siteOf(origin);
      var used = tabs.some(function (t) { var o = originOf(t.url || t.pendingUrl || ""); return o && siteOf(o) === site; });
      if (used) return null;
      return chrome.browsingData.remove({ origins: [origin] }, {
        cookies: true, localStorage: true, indexedDB: true, cacheStorage: true, serviceWorkers: true, fileSystems: true, cache: true
      });
    });
  });
}

function getTabOrigins() {
  return chrome.storage.session.get("tabOrigins").then(function (d) { return d.tabOrigins || {}; });
}

chrome.tabs.onUpdated.addListener(function (tabId, info) {
  if (!info.url) return;
  forgetQueue(function () {
    return getTabOrigins().then(function (map) {
      var prev = map[tabId], cur = originOf(info.url);
      map[tabId] = cur;
      return chrome.storage.session.set({ tabOrigins: map }).then(function () {
        if (prev && prev !== cur) return forgetIfUnused(prev);
        return null;
      });
    });
  });
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete tabStats[tabId];
  forgetQueue(function () {
    return getTabOrigins().then(function (map) {
      var prev = map[tabId];
      delete map[tabId];
      return chrome.storage.session.set({ tabOrigins: map }).then(function () {
        return forgetIfUnused(prev);
      });
    });
  });
});

forgetQueue(function () {
  return getTabOrigins().then(function (map) {
    return chrome.tabs.query({}).then(function (tabs) {
      tabs.forEach(function (t) { if (!(t.id in map)) map[t.id] = originOf(t.url || ""); });
      return chrome.storage.session.set({ tabOrigins: map });
    });
  });
});
