// SW module: event wiring. All listeners live here — exactly one per event, calling into
// the other modules. Loaded last by background.js.

var chain = Promise.resolve();
function enqueue(fn) {
  chain = chain.then(fn).catch(function (e) { console.warn("[ADE]", e); });
  return chain;
}

// ---------- messages ----------
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;
  if (msg.type === "ade-trigger") {
    var tabId = sender.tab && sender.tab.id;
    if (typeof tabId === "number") bump(tabId, "spoof");
    return;
  }
  if (msg.type === "ade-report" || msg.type === "ade-get-stats") {
    buildReport(msg.tabId).then(function (s) {
      sendResponse({ blocked: s.blocked, spoof: s.spoof, domains: s.domains, cookies: adeCookiesDeleted });
    });
    return true;
  }
  if (msg.type === "ade-badger-stats") {
    badgerReady.then(function () { sendResponse(badgerCounts()); });
    return true;
  }
  if (msg.type === "ade-badger-reset") {
    badgerReset().then(function () { sendResponse({ ok: true }); });
    return true;
  }
  if (msg.type === "ade-site-legend") {
    siteLegend(adeSiteKey(msg.site)).then(function (l) { sendResponse({ legend: l || null }); }, function () { sendResponse({ legend: null }); });
    return true;
  }
  if (msg.type === "ade-burn-all") {
    burnAll(sendResponse);
    return true;
  }
});

// ---------- settings changes: reapply DNR + MAIN script, broadcast, patch open tabs ----------
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== "local" || !changes.settings) return;
  var prev = adeMergeDefaults(changes.settings.oldValue);
  var next = adeMergeDefaults(changes.settings.newValue);
  badgerSetCfg(next);
  cookieSetCfg(next);
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

// ---------- install / update ----------
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

// ---------- browser startup: identity rotation + forget-sites sweep + cookie greylist ----------
chrome.runtime.onStartup.addListener(function () {
  enqueue(function () {
    return adeGetSettings().then(function (settings) {
      // Rotate the stable legend so returning visits get a fresh fingerprint. Persisting
      // fires storage.onChanged, which re-applies header rules and broadcasts the legend.
      if (settings.enabled && settings.mode === "stable" && adeRotationDue(settings)) {
        adeRotateProfile(settings);
        return adeSetSettings(settings);
      }
      return null;
    });
  });
  forgetOnStartup();
  cookieOnStartup();
});

// ---------- navigation: stats reset + http-fallback tracking ----------
chrome.webNavigation.onBeforeNavigate.addListener(function (d) {
  if (d.frameId !== 0) return;
  tabStats[d.tabId] = freshStats(Math.floor(d.timeStamp));
  setBadge(d.tabId);
  saveStats();
  if (/^http:\/\//.test(d.url)) httpPending[d.tabId] = d.url; else delete httpPending[d.tabId];
});

// ---------- tabs: per-site legends + forget-sites + stats cleanup ----------
chrome.tabs.onUpdated.addListener(function (tabId, info) {
  if (!info.url) return;
  dropUnusedSites();
  forgetOnTabUrl(tabId, info.url);
  cookieOnTabUrl(tabId, info.url);
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  delete tabStats[tabId];
  delete httpPending[tabId];
  saveStats();
  dropUnusedSites();
  forgetOnTabRemoved(tabId);
  cookieOnTabRemoved(tabId);
});

// ---------- SW (re)start: make the world consistent ----------
enqueue(function () {
  return adeGetSettings().then(function (settings) {
    return applyDynamicState(settings).then(function () {
      return syncMainScript(settings);
    }).then(function () {
      return badgerBoot(settings);
    }).then(function () {
      cookieBoot(settings);
    });
  });
});
forgetReconcile();
