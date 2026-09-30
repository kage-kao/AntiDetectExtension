// Shared page helpers for popup & options: instant-save commit with error toast,
// i18n application, group toggles, country selector, identity generator.
// Keeps popup.js / options.js thin and free of duplicated logic.

var adeUi = (function () {
  var toastTimer = null;

  function toast(text) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 2800);
  }

  // Optimistic commit: mutate the local copy immediately, persist; rollback on failure.
  function commit(local, mutate, t, onRollback) {
    mutate(local);
    return adeUpdateSettings(mutate).then(
      function () {},
      function (e) {
        toast(t("not_saved") + (e && e.message ? ": " + e.message : ""));
        onRollback();
      }
    );
  }

  function t(settings, key) {
    var dict = ADE_I18N[(settings && settings.lang) || "ru"] || ADE_I18N.ru;
    return dict[key] || key;
  }

  function applyI18n(settings, root) {
    (root || document).querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = t(settings, el.getAttribute("data-i18n"));
    });
  }

  function fillCountries(sel) {
    sel.innerHTML = "";
    ADE_PRESETS.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.city + " (" + p.cc + ")";
      sel.appendChild(o);
    });
  }

  // Renders the 19 fingerprint-group switches. onToggle(key, value) persists one change.
  function renderGroups(box, settings, testidPrefix, onToggle) {
    box.innerHTML = "";
    Object.keys(ADE_DEFAULTS.groups).forEach(function (k) {
      var row = document.createElement("label");
      row.className = "row";
      row.innerHTML = "<span>" + t(settings, k) + "</span>" +
        '<span class="switch"><input type="checkbox" data-group="' + k + '" data-testid="' + testidPrefix + k + '"' +
        (settings.groups[k] ? " checked" : "") + '><span class="slider"></span></span>';
      box.appendChild(row);
    });
    box.querySelectorAll("input[data-group]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        onToggle(inp.getAttribute("data-group"), inp.checked);
      });
    });
  }

  // Binds the plain boolean settings toggles (same ids in both pages).
  function bindToggles(ids, commitFn, afterCommit) {
    ids.forEach(function (id) {
      document.getElementById(id).addEventListener("change", function (e) {
        var v = e.target.checked;
        var p = commitFn(function (s) { s[id] = v; });
        if (afterCommit) p.then(function () { afterCommit(id, v); });
      });
    });
  }

  // Creates & stores a fresh identity from the country/OS selectors. Returns a promise.
  function spawnProfile(countryId, osId) {
    var preset = document.getElementById(countryId).value || "de";
    var os = document.getElementById(osId).value || "win";
    return adeUpdateSettings(function (s) {
      adeStoreProfile(s, ADE_generateProfile(preset, os, (Math.random() * 4294967296) >>> 0));
    });
  }

  // In "random every visit" mode the identity controls have no effect — disable them.
  function syncModeControls(settings, ids) {
    var perVisit = (settings.mode || "stable") === "per-visit";
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = perVisit;
    });
  }

  function profileLine(p) {
    if (!p) return null;
    return p.locale + " · " + p.tzName + " · " + p.screenW + "×" + p.screenH +
      " · " + p.cores + " CPU / " + p.ram + " GB · " + p.city;
  }

  function profileDetails(p) {
    if (!p) return null;
    return p.locale + " · " + p.tzName + " (UTC" + (p.tzStd <= 0 ? "+" + (-p.tzStd / 60) : "-" + (p.tzStd / 60)) + ")" +
      " · " + p.screenW + "×" + p.screenH + " · " + p.cores + " CPU / " + p.ram + " GB" +
      " · " + p.gpuRenderer + " · " + p.city + " (" + p.lat.toFixed(2) + ", " + p.lon.toFixed(2) + ")";
  }

  return {
    toast: toast,
    commit: commit,
    t: t,
    applyI18n: applyI18n,
    fillCountries: fillCountries,
    renderGroups: renderGroups,
    bindToggles: bindToggles,
    spawnProfile: spawnProfile,
    syncModeControls: syncModeControls,
    profileLine: profileLine,
    profileDetails: profileDetails
  };
})();
