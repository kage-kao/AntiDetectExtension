// SW module: heuristic anti-tracking, Privacy Badger-style.
//
// Observes third-party requests (read-only webRequest) and remembers which
// registrable domains send or set cookies across DIFFERENT first-party sites.
// Once a domain shows tracking behaviour on >= BADGER_THRESHOLD distinct sites
// it is blocked with a session DNR rule. Learned data persists in
// storage.local; session rules are rebuilt on every browser start.

var BADGER_RULE_OFFSET = 160000;
var BADGER_MAX_BLOCKED = 1500;
var BADGER_THRESHOLD = 3;
var BADGER_TYPES = ["script", "image", "xmlhttprequest", "sub_frame", "font", "media", "ping", "websocket", "object", "other"];

// Never auto-block these: sign-in/payment/captcha flows and big CDNs where a
// block breaks sites (they are still covered by the static rulesets).
var BADGER_EXEMPT = [
  "google.com", "googleapis.com", "gstatic.com", "googlevideo.com", "youtube.com", "ytimg.com",
  "microsoft.com", "live.com", "microsoftonline.com", "apple.com", "icloud.com",
  "paypal.com", "stripe.com", "cloudflare.com",
  "facebook.com", "fbcdn.net", "instagram.com", "twitter.com", "twimg.com",
  "github.com", "githubusercontent.com", "gitlab.com", "mozilla.org", "mozilla.net",
  "amazon.com", "ssl-images-amazon.com", "media-amazon.com",
  "cloudfront.net", "akamaihd.net", "akamaized.net", "jsdelivr.net", "unpkg.com", "cdnjs.com",
  "recaptcha.net", "hcaptcha.com"
];

var badgerData = { trackers: {} };
var badgerReady = chrome.storage.local.get("adeBadger").then(function (d) {
  if (d && d.adeBadger && d.adeBadger.trackers) badgerData = d.adeBadger;
}).catch(function () {});

var badgerCfg = { on: false, exempt: {} };
var badgerWasOn = null;

// Preload config immediately so webRequest events firing before badgerBoot() (the
// SW-start enqueue chain) are not silently dropped.
adeGetSettings().then(function (s) { badgerSetCfg(s); }).catch(function () {});

var badgerSaveTimer = null;
function badgerSave(immediate) {
  clearTimeout(badgerSaveTimer);
  // Threshold crossings persist right away — a debounced write dies with the SW.
  if (immediate) { chrome.storage.local.set({ adeBadger: badgerData }).catch(function () {}); return; }
  badgerSaveTimer = setTimeout(function () {
    chrome.storage.local.set({ adeBadger: badgerData }).catch(function () {});
  }, 500);
}

// Serialize session-rule rebuilds: concurrent getSessionRules->updateSessionRules
// pairs lose rules (atomic duplicate-id failure).
var badgerChain = Promise.resolve();
function badgerQueue(fn) {
  badgerChain = badgerChain.then(fn).catch(function (e) { console.warn("[ADE badger]", e); });
  return badgerChain;
}

function badgerSetCfg(settings) {
  var on = !!settings.enabled && !!settings.badger;
  var exempt = {};
  BADGER_EXEMPT.concat(ADE_BUILTIN_BYPASS_HOSTS, settings.whitelist || []).forEach(function (h) {
    var k = adeSiteKey(String(h).replace(/^www\./, "").toLowerCase());
    if (k) exempt[k] = 1;
  });
  badgerCfg = { on: on, exempt: exempt };
  if (badgerWasOn === null) { badgerWasOn = on; return; }
  if (badgerWasOn !== on) {
    badgerWasOn = on;
    badgerApplyAll(); // clears session rules when switched off, restores when on
  }
}

function badgerRuleFor(domain, i) {
  return { id: BADGER_RULE_OFFSET + i, priority: 55, action: { type: "block" },
    condition: { urlFilter: "||" + domain + "^", resourceTypes: BADGER_TYPES } };
}

// Rebuilds the whole badger session-rule slice (ids BADGER_RULE_OFFSET..+MAX).
function badgerApplyAll() {
  return badgerQueue(function () { return badgerApplyAllInner(); });
}

function badgerApplyAllInner() {
  return chrome.declarativeNetRequest.getSessionRules().then(function (rules) {
    var removeRuleIds = rules
      .filter(function (r) { return r.id >= BADGER_RULE_OFFSET && r.id < BADGER_RULE_OFFSET + BADGER_MAX_BLOCKED; })
      .map(function (r) { return r.id; });
    var addRules = [];
    if (badgerCfg.on) {
      Object.keys(badgerData.trackers)
        .filter(function (d) { return badgerData.trackers[d].blocked; })
        .sort(function (a, b) { return (badgerData.trackers[b].lastSeen || 0) - (badgerData.trackers[a].lastSeen || 0); })
        .slice(0, BADGER_MAX_BLOCKED)
        .forEach(function (d, i) { addRules.push(badgerRuleFor(d, i)); });
    }
    if (!removeRuleIds.length && !addRules.length) return null;
    return chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: removeRuleIds, addRules: addRules })
      .catch(function (e) { console.warn("[ADE badger]", e); });
  });
}

// One observed tracking act: `pageUrl`'s site pulled `reqUrl` with cookies attached.
function badgerObserve(reqUrl, pageUrl) {
  if (!badgerCfg.on) return;
  var reqHost = adeHostFromUrl(reqUrl), pageHost = adeHostFromUrl(pageUrl);
  if (!reqHost || !pageHost) return;
  var tKey = adeSiteKey(reqHost), fKey = adeSiteKey(pageHost);
  if (!tKey || !fKey || tKey === fKey || badgerCfg.exempt[tKey]) return;
  var e = badgerData.trackers[tKey];
  if (!e) e = badgerData.trackers[tKey] = { sites: {}, blocked: false, lastSeen: 0 };
  var isNewSite = !e.sites[fKey];
  e.sites[fKey] = Date.now();
  e.lastSeen = Date.now();
  if (!e.blocked && Object.keys(e.sites).length >= BADGER_THRESHOLD) {
    e.blocked = true;
    badgerSave(true);
    badgerApplyAll();
  } else if (isNewSite) {
    badgerSave();
  }
}

function badgerHasHeader(headers, name) {
  for (var i = 0; i < (headers || []).length; i++) {
    if (headers[i].name.toLowerCase() === name) return true;
  }
  return false;
}

// Read-only observation (MV3 allows non-blocking webRequest). Guarded: the
// permission may be absent on a browser that refuses it.
try {
  if (chrome.webRequest && chrome.webRequest.onSendHeaders) {
    chrome.webRequest.onSendHeaders.addListener(function (d) {
      if (d.type === "main_frame" || !d.initiator) return;
      if (badgerHasHeader(d.requestHeaders, "cookie")) badgerObserve(d.url, d.initiator);
    }, { urls: ["http://*/*", "https://*/*"], types: BADGER_TYPES }, ["requestHeaders", "extraHeaders"]);

    chrome.webRequest.onHeadersReceived.addListener(function (d) {
      if (d.type === "main_frame" || !d.initiator) return;
      if (badgerHasHeader(d.responseHeaders, "set-cookie")) badgerObserve(d.url, d.initiator);
    }, { urls: ["http://*/*", "https://*/*"], types: BADGER_TYPES }, ["responseHeaders", "extraHeaders"]);
  }
} catch (e) { console.warn("[ADE badger]", e); }

function badgerCounts() {
  var learned = 0, blocked = 0;
  Object.keys(badgerData.trackers).forEach(function (d) {
    learned++;
    if (badgerData.trackers[d].blocked) blocked++;
  });
  return { learned: learned, blocked: blocked };
}

function badgerReset() {
  badgerData = { trackers: {} };
  badgerSave(true);
  return badgerApplyAll();
}

// SW (re)start: wait for the learned data, then rebuild session rules.
function badgerBoot(settings) {
  badgerSetCfg(settings);
  return badgerReady.then(function () { return badgerApplyAll(); });
}
