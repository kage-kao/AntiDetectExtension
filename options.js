// Options: instant save, textareas debounce 250 ms, identity generator, live sync.
// Shared page logic (toggles, groups, countries, identity generator) lives in shared/ui.js.

var TOGGLES = ["enabled", "blockAds", "blockTrackers", "blockAnnoyances", "blockSocial", "blockSecurity",
  "cosmetic", "forgetSites", "badger", "cookieAutoDelete", "autoConsent", "blockRemoteFonts",
  "httpsUpgrade", "blockCookies3p", "blockAdTopics", "cleanUrls", "ampRedirect", "gpc"];
var TEXTS = ["userBlockDomains", "userHideSelectors", "whitelist", "cookieKeepList", "cookieSessionList"];
var DEBOUNCE_MS = 250;
var timers = {};
var settings = null;

function t(key) { return adeUi.t(settings, key); }

function applyI18n() {
  adeUi.applyI18n(settings);
  document.title = "AntiDetectExtension — " + t("settings");
}

function linesToArray(v) {
  return v.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
}

function rollback() {
  adeGetSettings().then(function (s) { settings = s; refreshUI(true); });
}

function commit(mutate) {
  return adeUi.commit(settings, mutate, t, rollback);
}

function renderProfile() {
  var p = adeActiveProfile(settings);
  if (!p) {
    document.getElementById("profileName").textContent = "—";
    document.getElementById("profileMeta").textContent = "—";
    return;
  }
  document.getElementById("profileName").textContent = "🛡 " + p.name;
  document.getElementById("profileMeta").textContent = adeUi.profileDetails(p);
  document.getElementById("country").value = p.preset;
  document.getElementById("os").value = p.os;
  document.getElementById("mode").value = settings.mode || "stable";
  document.getElementById("rotate").value = settings.rotateIdentity || "off";
  adeUi.syncModeControls(settings, ["country", "os", "rotate", "newIdentity"]);
}

function renderGroups() {
  adeUi.renderGroups(document.getElementById("groups"), settings, "opt-group-", function (k, v) {
    commit(function (s) { s.groups[k] = v; });
  });
}

function refreshUI(force) {
  TOGGLES.forEach(function (id) { document.getElementById(id).checked = !!settings[id]; });
  TEXTS.forEach(function (id) {
    var el = document.getElementById(id);
    if (!force && (id in timers || document.activeElement === el)) return;
    el.value = (settings[id] || []).join("\n");
  });
  document.getElementById("lang").value = settings.lang;
  document.body.classList.toggle("off", !settings.enabled);
  applyI18n();
  renderProfile();
  renderGroups();
}

function flushText(id) {
  if (!(id in timers)) return;
  clearTimeout(timers[id]);
  delete timers[id];
  var v = linesToArray(document.getElementById(id).value);
  commit(function (s) { s[id] = v; });
}

function bindText(id) {
  var el = document.getElementById(id);
  el.addEventListener("input", function () {
    clearTimeout(timers[id]);
    timers[id] = setTimeout(function () { flushText(id); }, DEBOUNCE_MS);
  });
  el.addEventListener("blur", function () { flushText(id); });
}

function loadBadgerStats() {
  var el = document.getElementById("badgerInfo");
  if (!el) return;
  chrome.runtime.sendMessage({ type: "ade-badger-stats" }, function (r) {
    if (chrome.runtime.lastError || !r) { el.textContent = "—"; return; }
    el.textContent = t("badger_learned") + ": " + r.learned + " · " + t("badger_blocked") + ": " + r.blocked;
  });
}

function init() {
  adeGetSettings().then(function (s) {
    settings = s;
    adeUi.fillCountries(document.getElementById("country"));
    refreshUI(true);
    loadBadgerStats();

    adeUi.bindToggles(TOGGLES, commit, function (id, v) {
      if (id === "enabled") document.body.classList.toggle("off", !v);
      if (id === "badger") loadBadgerStats();
    });

    document.getElementById("badgerReset").addEventListener("click", function () {
      chrome.runtime.sendMessage({ type: "ade-badger-reset" }, function () {
        if (!chrome.runtime.lastError) { loadBadgerStats(); adeUi.toast(t("badger_reset_done")); }
      });
    });
    TEXTS.forEach(bindText);

    document.getElementById("lang").addEventListener("change", function (e) {
      var v = e.target.value;
      commit(function (s2) { s2.lang = v; });
      applyI18n();
      renderGroups();
    });

    document.getElementById("mode").addEventListener("change", function (e) {
      var v = e.target.value;
      commit(function (s2) { s2.mode = v; });
      renderProfile();
    });

    document.getElementById("rotate").addEventListener("change", function (e) {
      var v = e.target.value;
      commit(function (s2) { s2.rotateIdentity = v; });
    });

    var spawn = function () {
      adeUi.spawnProfile("country", "os").then(function () {
        return adeGetSettings();
      }).then(function (s2) { settings = s2; refreshUI(true); }, rollback);
    };
    document.getElementById("newIdentity").addEventListener("click", spawn);
    document.getElementById("country").addEventListener("change", spawn);
    document.getElementById("os").addEventListener("change", spawn);

    var flushAll = function () { TEXTS.forEach(flushText); };
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flushAll(); });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes.settings) return;
      settings = adeMergeDefaults(changes.settings.newValue);
      refreshUI(false);
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
