// SW module: MAIN-world script registration + open-tab injection + settings broadcast.

var MAIN_ID = "ade-main";
var GROUP_KEYS = Object.keys(ADE_DEFAULTS.groups);

// MAIN modules in load order (env first, boot last — see content/main/*).
var MAIN_MODULES = ["env", "state", "hooks-core", "hooks-canvas", "hooks-webgl", "hooks-webgpu", "hooks-audio",
  "hooks-rects", "hooks-fonts", "hooks-navigator", "hooks-uach", "hooks-intl", "hooks-timezone",
  "hooks-geo", "hooks-screen", "hooks-webrtc", "hooks-battery", "hooks-media", "hooks-sensors",
  "hooks-workers", "hooks-analytics", "hooks-stealth", "boot"];

function mainFlags(settings) {
  var out = GROUP_KEYS.filter(function (k) { return settings.groups[k]; });
  if (settings.gpc) out.push("gpc");
  if (settings.blockAdTopics) out.push("adtech");
  return out;
}

function mainFiles(settings) {
  var files = ["shared/profiles.js", "content/flags/on.js"];
  mainFlags(settings).forEach(function (k) { files.push("content/flags/" + k + ".js"); });
  MAIN_MODULES.forEach(function (m) { files.push("content/main/" + m + ".js"); });
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
  }).catch(function (e) {
    // A missing file kills the whole registration — without this log it fails silently.
    console.warn("[ADE main-script]", e);
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
          return chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ["shared/common.js", "content/bridge.js"] }).catch(function () {});
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
