// SW module: "forget sites" (wipe an origin once its last tab closes) + the fire button.
//
// Tab->origin mapping persists in storage.local (adeTabOrigins) so origins from a session
// where the browser was closed with open tabs still get wiped on the next startup.

var ADE_FORGET_TYPES = {
  cookies: true, localStorage: true, indexedDB: true, cacheStorage: true,
  serviceWorkers: true, fileSystems: true, cache: true, webSQL: true
};

var forgetChain = Promise.resolve();
function forgetQueue(fn) {
  forgetChain = forgetChain.then(fn).catch(function (e) { console.warn("[ADE forget]", e); });
}

function originOf(url) {
  try { var u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : ""; } catch (e) { return ""; }
}

// http/https × host/www.host × exact port — all wiped together.
// Ports matter: chrome.browsingData keys web-storage/IndexedDB/SW/CacheStorage by full origin
// (scheme + host + port), so a site served on a non-standard port (e.g. :8899) survived the
// wipe when the port was dropped. We emit every scheme/host variant at the real port AND at
// the default port so storage set under either is cleared.
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
        add(proto + "//" + h);                      // default port
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

// Tab navigated: update its origin, wipe the previous one if nothing else uses it.
function forgetOnTabUrl(tabId, url) {
  forgetQueue(function () {
    return loadPersistedOrigins().then(function (map) {
      var prev = map[tabId], cur = originOf(url);
      if (cur) map[tabId] = cur; else delete map[tabId];
      return savePersistedOrigins(map).then(function () {
        if (prev && prev !== cur) return forgetIfUnused(prev);
        return null;
      });
    });
  });
}

// Tab closed: wipe its origin if nothing else uses it.
function forgetOnTabRemoved(tabId) {
  forgetQueue(function () {
    return loadPersistedOrigins().then(function (map) {
      var prev = map[tabId];
      delete map[tabId];
      return savePersistedOrigins(map).then(function () { return forgetIfUnused(prev); });
    });
  });
}

// Browser was closed with tabs open: wipe origins from the last session that aren't open now.
function forgetOnStartup() {
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
}

// SW (re)start: reconcile the persisted map with the tabs that are actually open.
function forgetReconcile() {
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
}

// Fire button: wipe absolutely everything (except downloads), reset the extension
// to a fresh identity, then close every tab in every window.
function burnAll(sendResponse) {
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
    .then(function () {
      // Wait the pending initial read, or it would restore the pre-burn counter.
      if (typeof cookiesReady !== "undefined" && cookiesReady && cookiesReady.then) return cookiesReady;
      return null;
    })
    .then(function () {
      // Reset in-memory module state too: storage.clear() alone leaves the badger
      // session rules active and stale counters that would be re-persisted.
      if (typeof badgerReset === "function") badgerReset().catch(function () {});
      if (typeof adeCookiesDeleted !== "undefined") adeCookiesDeleted = 0;
      if (typeof tabStats === "object") Object.keys(tabStats).forEach(function (k) { delete tabStats[k]; });
      return Promise.all([
        chrome.storage.session.set({ adeCookiesDeleted: 0 }).catch(function () {}),
        chrome.storage.session.set({ adeTabStats: {} }).catch(function () {})
      ]);
    })
    .then(function () { sendResponse({ ok: true }); })
    .then(function () { return chrome.tabs.query({}); })
    .then(function (tabs) {
      var ids = (tabs || []).map(function (t) { return t.id; }).filter(function (id) { return typeof id === "number"; });
      if (ids.length) return chrome.tabs.remove(ids).catch(function () {});
    })
    .catch(function () { try { sendResponse({ ok: false }); } catch (e) {} });
}
