// Popup: instant save, profile generator, tab stats, fire button, live sync.
var GROUP_KEYS = Object.keys(ADE_DEFAULTS.groups);
var settings = null;
var currentHost = "";
var currentTabId = null;
var currentUrl = "";
var report = null;
var siteLegendCur = null;
var TOGGLES = ["enabled", "blockAds", "blockTrackers", "cosmetic", "forgetSites",
  "httpsUpgrade", "blockCookies3p", "blockAdTopics", "cleanUrls", "ampRedirect", "gpc"];

function t(key) {
  var dict = ADE_I18N[(settings && settings.lang) || "ru"] || ADE_I18N.ru;
  return dict[key] || key;
}

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(function (el) {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
}

function rollback() {
  adeGetSettings().then(function (s) { settings = s; refreshUI(); });
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

function currentProfile() {
  return adeActiveProfile(settings);
}

function loadSiteLegend() {
  if (!settings || settings.rotateIdentity !== "site" || !/^https?:/.test(currentUrl)) { siteLegendCur = null; renderProfile(); return; }
  chrome.runtime.sendMessage({ type: "ade-site-legend", site: adeSiteKey(currentHost) }, function (r) {
    siteLegendCur = (!chrome.runtime.lastError && r && r.legend) || null;
    renderProfile();
  });
}

function renderProfile() {
  var p = siteLegendCur || currentProfile();
  var nameEl = document.getElementById("profileName");
  var metaEl = document.getElementById("profileMeta");
  if (!p) {
    nameEl.textContent = "—";
    metaEl.textContent = "—";
    return;
  }
  nameEl.textContent = "🛡 " + p.name;
  metaEl.textContent = p.locale + " · " + p.tzName + " · " + p.screenW + "×" + p.screenH +
    " · " + p.cores + " CPU / " + p.ram + " GB · " + p.city;
  document.getElementById("country").value = p.preset;
  document.getElementById("os").value = p.os;
}

function renderGroups() {
  var box = document.getElementById("groups");
  box.innerHTML = "";
  GROUP_KEYS.forEach(function (k) {
    var row = document.createElement("label");
    row.className = "row";
    row.innerHTML = "<span>" + t(k) + "</span>" +
      '<span class="switch"><input type="checkbox" data-group="' + k + '" data-testid="group-' + k + '"' +
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

function isWhitelisted() {
  return adeIsWhitelisted(settings, currentHost);
}

// In "random every visit" mode the country/OS/identity/rotate controls have no effect
// (the legend is re-rolled from the real OS on every page load), so disable them to
// avoid the impression that they do something.
function syncModeControls() {
  var perVisit = (settings.mode || "stable") === "per-visit";
  ["country", "os", "rotate", "newIdentity"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.disabled = perVisit;
  });
}

function refreshUI() {
  document.getElementById("host").textContent = currentHost || "—";
  TOGGLES.forEach(function (id) { document.getElementById(id).checked = !!settings[id]; });
  document.getElementById("siteToggle").checked = settings.enabled && !isWhitelisted();
  document.getElementById("siteToggle").disabled = !settings.enabled || !currentHost;
  document.getElementById("lang").value = settings.lang;
  document.getElementById("burn").title = t("burn");
  document.getElementById("mode").value = settings.mode || "stable";
  document.getElementById("rotate").value = settings.rotateIdentity || "off";
  syncModeControls();
  document.body.classList.toggle("off", !settings.enabled);
  applyI18n();
  renderProfile();
  renderGroups();
  renderReport();
}

function bindToggle(id, key) {
  document.getElementById(id).addEventListener("change", function (e) {
    var v = e.target.checked;
    commit(function (s) { s[key] = v; }).then(refreshUI);
  });
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
  }).then(function (s) { settings = s; refreshUI(); }, rollback);
}

function renderReport() {
  var r = report || { blocked: 0, spoof: 0, domains: {} };
  document.getElementById("statBlocked").textContent = r.blocked || 0;
  document.getElementById("statSpoof").textContent = r.spoof || 0;
}

function loadReport() {
  if (currentTabId == null) return;
  chrome.runtime.sendMessage({ type: "ade-report", tabId: currentTabId }, function (r) {
    if (chrome.runtime.lastError || !r) return;
    report = r;
    renderReport();
  });
}

function burnAll() {
  // Fire button: instantly wipe ALL browsing data and close every tab in every window.
  chrome.runtime.sendMessage({ type: "ade-burn-all" }, function () { void chrome.runtime.lastError; });
}

function init() {
  adeGetSettings().then(function (s) {
    settings = s;
    fillCountries();
    refreshUI();

    TOGGLES.forEach(function (id) { bindToggle(id, id); });
    document.getElementById("burn").addEventListener("click", burnAll);

    document.getElementById("siteToggle").addEventListener("change", function (e) {
      var h = currentHost.replace(/^www\./, "");
      if (!h) return;
      var protect = e.target.checked;
      commit(function (s2) {
        s2.whitelist = (s2.whitelist || []).filter(function (w) { return String(w).replace(/^www\./, "") !== h; });
        if (!protect) s2.whitelist.push(h);
      });
    });

    document.getElementById("lang").addEventListener("change", function (e) {
      var v = e.target.value;
      commit(function (s2) { s2.lang = v; });
      refreshUI();
    });

    document.getElementById("mode").addEventListener("change", function (e) {
      var v = e.target.value;
      commit(function (s2) { s2.mode = v; });
      refreshUI();
    });

    document.getElementById("rotate").addEventListener("change", function (e) {
      var v = e.target.value;
      commit(function (s2) { s2.rotateIdentity = v; });
    });

    document.getElementById("newIdentity").addEventListener("click", spawnProfile);
    document.getElementById("country").addEventListener("change", spawnProfile);
    document.getElementById("os").addEventListener("change", spawnProfile);

    document.getElementById("openSettings").addEventListener("click", function () { chrome.runtime.openOptionsPage(); });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes.settings) return;
      settings = adeMergeDefaults(changes.settings.newValue);
      refreshUI();
      loadSiteLegend();
    });

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab) return;
      currentTabId = tab.id;
      currentUrl = tab.url || tab.pendingUrl || "";
      currentHost = adeHostFromUrl(currentUrl);
      refreshUI();
      loadReport();
      loadSiteLegend();
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
