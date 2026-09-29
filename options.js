// Options: instant save, textareas debounce 250 ms, profile generator, live sync.
var GROUP_KEYS = Object.keys(ADE_DEFAULTS.groups);
var TOGGLES = ["enabled", "blockAds", "blockTrackers", "cosmetic", "forgetSites",
  "httpsUpgrade", "blockCookies3p", "blockAdTopics", "cleanUrls", "ampRedirect", "gpc"];
var TEXTS = ["userBlockDomains", "userHideSelectors", "whitelist"];
var DEBOUNCE_MS = 250;
var timers = {};
var settings = null;

function t(key) {
  var dict = ADE_I18N[(settings && settings.lang) || "ru"] || ADE_I18N.ru;
  return dict[key] || key;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.getAttribute("data-i18n")); });
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

function fillCountries() {
  var sel = document.getElementById("country");
  sel.innerHTML = "";
  ADE_PRESETS.forEach(function (p) {
    var o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.city + " (" + p.cc + ")";
    sel.appendChild(o);
  });
}

function renderProfile() {
  var p = adeActiveProfile(settings);
  if (!p) {
    document.getElementById("profileName").textContent = "—";
    document.getElementById("profileMeta").textContent = "—";
    return;
  }
  document.getElementById("profileName").textContent = "🛡 " + p.name;
  document.getElementById("profileMeta").textContent =
    p.locale + " · " + p.tzName + " (UTC" + (p.tzStd <= 0 ? "+" + (-p.tzStd / 60) : "-" + (p.tzStd / 60)) + ")" +
    " · " + p.screenW + "×" + p.screenH + " · " + p.cores + " CPU / " + p.ram + " GB" +
    " · " + p.gpuRenderer + " · " + p.city + " (" + p.lat.toFixed(2) + ", " + p.lon.toFixed(2) + ")";
  document.getElementById("country").value = p.preset;
  document.getElementById("os").value = p.os;
  document.getElementById("mode").value = settings.mode || "stable";
  document.getElementById("rotate").value = settings.rotateIdentity || "off";
  var perVisit = (settings.mode || "stable") === "per-visit";
  ["country", "os", "rotate", "newIdentity"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.disabled = perVisit;
  });
}

function renderGroups() {
  var box = document.getElementById("groups");
  box.innerHTML = "";
  GROUP_KEYS.forEach(function (k) {
    var row = document.createElement("label");
    row.className = "row";
    row.innerHTML = "<span>" + t(k) + "</span>" +
      '<span class="switch"><input type="checkbox" data-group="' + k + '" data-testid="opt-group-' + k + '"' +
      (settings.groups[k] ? " checked" : "") + '><span class="slider"></span></span>';
    box.appendChild(row);
  });
  box.querySelectorAll("input[data-group]").forEach(function (inp) {
    inp.addEventListener("change", function () {
      var k = inp.getAttribute("data-group"), v = inp.checked;
      commit(function (s) { s.groups[k] = v; });
    });
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

function spawnProfile() {
  adeUpdateSettings(function (s) {
    var preset = document.getElementById("country").value || "de";
    var os = document.getElementById("os").value || "win";
    var p = ADE_generateProfile(preset, os, (Math.random() * 4294967296) >>> 0);
    s.profiles = s.profiles || {};
    var ids = Object.keys(s.profiles);
    if (ids.length >= 5) delete s.profiles[ids[0]];
    s.profiles[p.id] = p;
    s.activeProfileId = p.id;
  }).then(function () {
    return adeGetSettings();
  }).then(function (s) { settings = s; refreshUI(true); }, rollback);
}

function init() {
  adeGetSettings().then(function (s) {
    settings = s;
    fillCountries();
    refreshUI(true);

    TOGGLES.forEach(function (id) {
      document.getElementById(id).addEventListener("change", function (e) {
        var v = e.target.checked;
        commit(function (s2) { s2[id] = v; });
        if (id === "enabled") document.body.classList.toggle("off", !v);
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

    document.getElementById("newIdentity").addEventListener("click", spawnProfile);
    document.getElementById("country").addEventListener("change", spawnProfile);
    document.getElementById("os").addEventListener("change", spawnProfile);

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
