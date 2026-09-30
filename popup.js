// Popup: instant save, identity card, tab stats, fire button, live sync.
// Shared page logic (toggles, groups, countries, identity generator) lives in shared/ui.js.

var TOGGLES = ["enabled", "blockAds", "blockTrackers", "blockAnnoyances", "blockSocial", "blockSecurity",
  "cosmetic", "forgetSites", "badger", "cookieAutoDelete", "autoConsent", "blockRemoteFonts",
  "httpsUpgrade", "blockCookies3p", "blockAdTopics", "cleanUrls", "ampRedirect", "gpc"];

var settings = null;
var currentHost = "";
var currentTabId = null;
var currentUrl = "";
var report = null;
var siteLegendCur = null;

function t(key) { return adeUi.t(settings, key); }
function applyI18n() { adeUi.applyI18n(settings); }

function rollback() {
  adeGetSettings().then(function (s) { settings = s; refreshUI(); });
}

function commit(mutate) {
  return adeUi.commit(settings, mutate, t, rollback);
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
  metaEl.textContent = adeUi.profileLine(p);
  document.getElementById("country").value = p.preset;
  document.getElementById("os").value = p.os;
}

function renderGroups() {
  adeUi.renderGroups(document.getElementById("groups"), settings, "group-", function (k, v) {
    commit(function (s) { s.groups[k] = v; });
  });
}

function isWhitelisted() {
  return adeIsWhitelisted(settings, currentHost);
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
  adeUi.syncModeControls(settings, ["country", "os", "rotate", "newIdentity"]);
  document.body.classList.toggle("off", !settings.enabled);
  applyI18n();
  renderProfile();
  renderGroups();
  renderReport();
}

function renderReport() {
  var r = report || { blocked: 0, spoof: 0, domains: {}, cookies: 0 };
  document.getElementById("statBlocked").textContent = r.blocked || 0;
  document.getElementById("statSpoof").textContent = r.spoof || 0;
  document.getElementById("statCookies").textContent = r.cookies || 0;
  var box = document.getElementById("domains");
  if (!box) return;
  var top = Object.keys(r.domains || {}).map(function (d) { return [d, r.domains[d]]; })
    .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 5);
  box.innerHTML = "";
  if (!top.length) { box.classList.remove("show"); return; }
  box.classList.add("show");
  var title = document.createElement("div");
  title.className = "domains-title";
  title.textContent = t("top_domains");
  box.appendChild(title);
  top.forEach(function (p) {
    var row = document.createElement("div");
    row.className = "domains-row";
    var name = document.createElement("span");
    name.className = "domains-name";
    name.textContent = p[0];
    var cnt = document.createElement("span");
    cnt.className = "domains-cnt";
    cnt.textContent = "\u00D7" + p[1];
    row.appendChild(name);
    row.appendChild(cnt);
    box.appendChild(row);
  });
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
    adeUi.fillCountries(document.getElementById("country"));
    refreshUI();

    adeUi.bindToggles(TOGGLES, commit, refreshUI);
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

    var spawn = function () {
      adeUi.spawnProfile("country", "os").then(function () {
        return adeGetSettings();
      }).then(function (s2) { settings = s2; refreshUI(); }, rollback);
    };
    document.getElementById("newIdentity").addEventListener("click", spawn);
    document.getElementById("country").addEventListener("change", spawn);
    document.getElementById("os").addEventListener("change", spawn);

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
