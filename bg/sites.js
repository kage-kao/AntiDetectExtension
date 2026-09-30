// SW module: per-site legends — live while any tab of the site is open (storage.session).
// A site's legend is re-rolled once its last tab closes, so the next visit is a fresh
// fingerprint without a browser restart.

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
