// SW module: Cookie AutoDelete-style cookie hygiene.
//
// - Last tab of a site closed -> every cookie of that registrable domain is removed
//   (lighter companion to "forget sites": works even when the full origin wipe is off).
// - cookieKeepList: domains whose cookies are never touched.
// - cookieSessionList ("greylist"): cookies survive the session, wiped on browser start.
// - Global whitelist / builtin bypass hosts are always respected.
// Deleted-cookie counter lives in storage.session for the popup stat.

var ADE_COOKIE_DELETED_KEY = "adeCookiesDeleted";
var ADE_COOKIE_TABS_KEY = "adeCookieTabs";

var cookieCfg = { master: false, on: false, keep: {}, session: {} };
var adeCookiesDeleted = 0;

var cookiesReady = chrome.storage.session.get(ADE_COOKIE_DELETED_KEY).then(function (d) {
  adeCookiesDeleted = (d && d[ADE_COOKIE_DELETED_KEY]) || 0;
}).catch(function () {});

// Preload config immediately so tab events firing before cookieBoot() (the SW-start
// enqueue chain) are handled with real settings, not the all-off defaults.
adeGetSettings().then(function (s) { cookieSetCfg(s); }).catch(function () {});

function cookieNorm(list) {
  var out = {};
  (list || []).forEach(function (h) {
    var k = adeSiteKey(String(h).replace(/^www\./, "").trim().toLowerCase());
    if (k) out[k] = 1;
  });
  return out;
}

function cookieSetCfg(settings) {
  cookieCfg = {
    master: !!settings.enabled,
    on: !!settings.cookieAutoDelete,
    keep: cookieNorm((settings.cookieKeepList || []).concat(settings.whitelist || [], ADE_BUILTIN_BYPASS_HOSTS)),
    session: cookieNorm(settings.cookieSessionList || [])
  };
}

function cookieBumpDeleted(n) {
  // Chain after the initial read: otherwise a fast bump is overwritten by the
  // stored value when cookiesReady resolves.
  cookiesReady.then(function () {
    adeCookiesDeleted += n;
    chrome.storage.session.set({ adeCookiesDeleted: adeCookiesDeleted }).catch(function () {});
  });
}

// Removes every cookie whose domain is `siteKey` or one of its subdomains.
function cookieDeleteDomain(siteKey) {
  if (!chrome.cookies || !siteKey) return Promise.resolve(0);
  return chrome.cookies.getAll({ domain: siteKey }).then(function (list) {
    var removed = 0;
    return Promise.all((list || []).map(function (c) {
      var url = (c.secure ? "https://" : "http://") + c.domain.replace(/^\./, "") + (c.path || "/");
      return chrome.cookies.remove({ url: url, name: c.name, storeId: c.storeId })
        .then(function (r) { if (r) removed++; })
        .catch(function () {});
    })).then(function () {
      if (removed) cookieBumpDeleted(removed);
      return removed;
    });
  }).catch(function () { return 0; });
}

// Delete the site's cookies only when no remaining tab uses it.
function cookieCleanIfUnused(siteKey) {
  if (!siteKey || !cookieCfg.master || !cookieCfg.on) return Promise.resolve();
  if (cookieCfg.keep[siteKey] || cookieCfg.session[siteKey]) return Promise.resolve();
  return chrome.tabs.query({}).then(function (tabs) {
    var used = tabs.some(function (t) {
      return adeSiteKey(adeHostFromUrl(t.url || t.pendingUrl || "")) === siteKey;
    });
    return used ? 0 : cookieDeleteDomain(siteKey);
  });
}

var cookieChain = Promise.resolve();
function cookieQueue(fn) {
  cookieChain = cookieChain.then(fn).catch(function (e) { console.warn("[ADE cookies]", e); });
}

function cookieLoadTabs() {
  return chrome.storage.local.get(ADE_COOKIE_TABS_KEY).then(function (d) { return d[ADE_COOKIE_TABS_KEY] || {}; });
}
function cookieSaveTabs(map) {
  return chrome.storage.local.set({ [ADE_COOKIE_TABS_KEY]: map });
}

// Tab navigated: update its site, clean the previous one if nothing else uses it.
function cookieOnTabUrl(tabId, url) {
  cookieQueue(function () {
    return cookieLoadTabs().then(function (map) {
      var prev = map[tabId];
      var cur = adeSiteKey(adeHostFromUrl(url));
      if (cur) map[tabId] = cur; else delete map[tabId];
      return cookieSaveTabs(map).then(function () {
        if (prev && prev !== cur) return cookieCleanIfUnused(prev);
        return null;
      });
    });
  });
}

// Tab closed: clean its site if nothing else uses it.
function cookieOnTabRemoved(tabId) {
  cookieQueue(function () {
    return cookieLoadTabs().then(function (map) {
      var prev = map[tabId];
      delete map[tabId];
      return cookieSaveTabs(map).then(function () { return cookieCleanIfUnused(prev); });
    });
  });
}

// Browser start: wipe greylist ("session only") cookies, reconcile the tab map.
function cookieOnStartup() {
  cookieQueue(function () {
    return adeGetSettings().then(function (s) {
      cookieSetCfg(s);
      if (!cookieCfg.master || !cookieCfg.on) return null;
      return Promise.all(Object.keys(cookieCfg.session).map(function (d) {
        return cookieDeleteDomain(d);
      }));
    }).then(function () {
      return cookieLoadTabs();
    }).then(function (map) {
      return chrome.tabs.query({}).then(function (tabs) {
        var next = {};
        tabs.forEach(function (t) {
          var k = adeSiteKey(adeHostFromUrl(t.url || t.pendingUrl || ""));
          if (k) next[t.id] = k;
        });
        return cookieSaveTabs(next);
      });
    });
  });
}

// SW (re)start: refresh config + reconcile the persisted tab map with live tabs.
function cookieBoot(settings) {
  cookieSetCfg(settings);
  cookieQueue(function () {
    return cookieLoadTabs().then(function (map) {
      return chrome.tabs.query({}).then(function (tabs) {
        var live = {};
        tabs.forEach(function (t) {
          var k = adeSiteKey(adeHostFromUrl(t.url || ""));
          if (k) live[t.id] = k;
        });
        Object.keys(map).forEach(function (k) { if (!(k in live)) delete map[k]; });
        Object.keys(live).forEach(function (k) { map[k] = live[k]; });
        return cookieSaveTabs(map);
      });
    });
  });
}
