// Popup: instant save, profile generator (stable legend / per-visit), live sync with storage.
var GROUP_KEYS = Object.keys(ADE_DEFAULTS.groups);
var settings = null;
var currentHost = "";
var currentTabId = null;

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

function renderProfile() {
  var p = currentProfile();
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

function refreshUI() {
  document.getElementById("host").textContent = currentHost || "—";
  document.getElementById("enabled").checked = settings.enabled;
  document.getElementById("siteToggle").checked = settings.enabled && !isWhitelisted();
  document.getElementById("siteToggle").disabled = !settings.enabled || !currentHost;
  document.getElementById("blockAds").checked = settings.blockAds;
  document.getElementById("blockTrackers").checked = settings.blockTrackers;
  document.getElementById("cosmetic").checked = settings.cosmetic;
  document.getElementById("forgetSites").checked = settings.forgetSites;
  document.getElementById("lang").value = settings.lang;
  document.getElementById("mode").value = settings.mode || "stable";
  document.body.classList.toggle("off", !settings.enabled);
  applyI18n();
  renderProfile();
  renderGroups();
}

function bindToggle(id, key) {
  document.getElementById(id).addEventListener("change", function (e) {
    var v = e.target.checked;
    commit(function (s) { s[key] = v; }).then(refreshUI);
  });
}

function spawnProfile() {
  adeUi.status("saving", t("saving"));
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
    adeUi.status("saved", t("saved_ok"));
    return adeGetSettings();
  }).then(function (s) { settings = s; refreshUI(); }, rollback);
}

function loadStats() {
  if (currentTabId == null) return;
  chrome.runtime.sendMessage({ type: "ade-get-stats", tabId: currentTabId }, function (s) {
    if (chrome.runtime.lastError || !s) return;
    document.getElementById("statBlocked").textContent = s.blocked || 0;
    document.getElementById("statSpoof").textContent = s.spoof || 0;
  });
}

function init() {
  adeGetSettings().then(function (s) {
    settings = s;
    fillCountries();
    refreshUI();

    bindToggle("enabled", "enabled");
    bindToggle("blockAds", "blockAds");
    bindToggle("blockTrackers", "blockTrackers");
    bindToggle("cosmetic", "cosmetic");
    bindToggle("forgetSites", "forgetSites");

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

    document.getElementById("newIdentity").addEventListener("click", spawnProfile);
    document.getElementById("country").addEventListener("change", spawnProfile);
    document.getElementById("os").addEventListener("change", spawnProfile);

    document.getElementById("openSettings").addEventListener("click", function () { chrome.runtime.openOptionsPage(); });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local" || !changes.settings) return;
      settings = adeMergeDefaults(changes.settings.newValue);
      refreshUI();
    });

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab) return;
      currentTabId = tab.id;
      currentHost = adeHostFromUrl(tab.url || tab.pendingUrl || "");
      refreshUI();
      loadStats();
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
