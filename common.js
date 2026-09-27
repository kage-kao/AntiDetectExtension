// Shared defaults & storage helpers. Plain script: SW (importScripts), popup/options, ISOLATED bridge.
// Top-level `var`/functions so re-injection into the same world is safe.

var ADE_DEFAULTS = {
  enabled: true,
  groups: {
    canvas: true,
    webgl: true,
    audio: true,
    rects: true,
    fonts: true,
    navigator: true,
    screen: true,
    uach: true,
    locale: true,
    geo: false,
    timezone: false,
    webrtc: true,
    battery: true,
    media: true,
    beacon: true,
    analytics: true,
    sensors: true,
    workers: true,
    stealth: true
  },
  // stable = one consistent legend until you press "New identity", per-visit = v1 behaviour
  mode: "stable",
  activeProfileId: null,
  profiles: {},
  blockAds: true,
  blockTrackers: true,
  cosmetic: true,
  forgetSites: false,
  userBlockDomains: [],
  userHideSelectors: [],
  whitelist: [],
  lang: "ru"
};

var ADE_DYNAMIC_RULE_OFFSET = 100000;
var ADE_HEADER_RULE_ID = 99000;

var ADE_BUILTIN_BYPASS_HOSTS = [
  "challenges.cloudflare.com",
  "turnstile.cloudflare.com"
];

function adeIsBuiltinBypass(host) {
  if (!host) return false;
  var h = String(host).replace(/^www\./, "").toLowerCase();
  return ADE_BUILTIN_BYPASS_HOSTS.some(function (b) { return h === b || h.endsWith("." + b); });
}

function adeMergeDefaults(stored) {
  var s = stored || {};
  var out = JSON.parse(JSON.stringify(ADE_DEFAULTS));
  Object.keys(out).forEach(function (k) {
    if (s[k] === undefined) return;
    if (k === "groups" && typeof s.groups === "object") Object.assign(out.groups, s.groups);
    else out[k] = s[k];
  });
  return out;
}

function adeGetSettings() {
  return new Promise(function (resolve) {
    try {
      chrome.storage.local.get("settings", function (data) {
        resolve(adeMergeDefaults(data && data.settings));
      });
    } catch (e) {
      resolve(adeMergeDefaults(null));
    }
  });
}

function adeSetSettings(settings) {
  return new Promise(function (resolve, reject) {
    chrome.storage.local.set({ settings: settings }, function () {
      var err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message)); else resolve(settings);
    });
  });
}

var adeWriteChain = Promise.resolve();
function adeUpdateSettings(mutate) {
  var p = adeWriteChain.then(function () {
    return adeGetSettings().then(function (s) { mutate(s); return adeSetSettings(s); });
  });
  adeWriteChain = p.catch(function () {});
  return p;
}

function adeHostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

function adeIsWhitelisted(settings, host) {
  if (!host) return false;
  var h = String(host).replace(/^www\./, "").toLowerCase();
  return (settings.whitelist || []).some(function (w) {
    var ww = String(w).replace(/^www\./, "").trim().toLowerCase();
    if (!ww) return false;
    return h === ww || h.endsWith("." + ww);
  });
}

function adeActiveProfile(settings) {
  if (settings && settings.profiles && settings.activeProfileId && settings.profiles[settings.activeProfileId]) {
    return settings.profiles[settings.activeProfileId];
  }
  return null;
}

// Guarantees a usable profile exists. Needs profiles.js loaded (ADE_generateProfile).
function adeEnsureProfile(settings) {
  var p = adeActiveProfile(settings);
  if (p) return p;
  try {
    p = ADE_generateProfile("de", "win", (Math.random() * 4294967296) >>> 0);
  } catch (e) {
    return null;
  }
  settings.profiles = settings.profiles || {};
  var ids = Object.keys(settings.profiles);
  if (ids.length >= 5) {
    delete settings.profiles[ids[0]];
  }
  settings.profiles[p.id] = p;
  settings.activeProfileId = p.id;
  return p;
}

if (typeof module !== "undefined") {
  module.exports = { ADE_DEFAULTS: ADE_DEFAULTS, adeMergeDefaults: adeMergeDefaults, adeHostFromUrl: adeHostFromUrl, adeIsWhitelisted: adeIsWhitelisted, adeIsBuiltinBypass: adeIsBuiltinBypass };
}
