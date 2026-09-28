// Self-test: shows the active legend (expected spoofed values), group status,
// neutralized analytics vendors, and the extension-page baseline for comparison.

var ANALYTICS_VENDORS = [
  "PostHog", "Google Analytics / GTM", "Matomo", "Umami", "Plausible", "OpenPanel",
  "RudderStack", "Countly", "OpenReplay", "Highlight", "Amplitude", "Mixpanel",
  "Segment", "Heap", "Hotjar", "FullStory", "LogRocket", "Sentry", "MS Clarity",
  "Yandex Metrica", "Smartlook", "Mouseflow", "Inspectlet", "Lucky Orange", "Crazy Egg"
];

function el(tag, cls, txt) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function kv(box, k, v) {
  box.appendChild(el("div", "k", k));
  box.appendChild(el("div", "v", String(v)));
}

function tzOffsetLabel(std) {
  var h = -std / 60;
  return "UTC" + (h >= 0 ? "+" : "") + h;
}

function renderLegend(p, mode) {
  var box = document.getElementById("legend");
  box.innerHTML = "";
  document.getElementById("modeLine").textContent =
    (mode === "per-visit" ? "Mode: random every visit" : "Mode: stable legend");
  if (!p) { kv(box, "Profile", "— (none yet, open any site once)"); return; }
  kv(box, "Name", p.name);
  kv(box, "User-Agent", p.ua);
  kv(box, "Platform", p.platform + " (" + p.uaPlatform + ")");
  kv(box, "Chrome / brand major", p.chrome + " / " + p.brandMajor);
  kv(box, "CPU cores / RAM", p.cores + " / " + p.ram + " GB");
  kv(box, "GPU vendor", p.gpuVendor);
  kv(box, "GPU renderer", p.gpuRenderer);
  kv(box, "Screen", p.screenW + "×" + p.screenH + " @" + p.dpr + "x, " + p.depth + "-bit");
  kv(box, "Locale / languages", p.locale + " · " + p.langs.join(", "));
  kv(box, "Timezone", p.tzName + " (" + tzOffsetLabel(p.tzStd) + ", DST=" + p.tzDst + ")");
  kv(box, "Geo (lat, lon)", p.lat + ", " + p.lon + " ±" + p.acc + "m");
  kv(box, "Audio sampleRate", p.sampleRate);
  kv(box, "Touch points", p.touch);
  kv(box, "Fonts", p.fonts.length + " installed: " + p.fonts.slice(0, 6).join(", ") + "…");
  kv(box, "Seed", p.seed);
}

function renderGroups(s) {
  var box = document.getElementById("groups");
  box.innerHTML = "";
  var dict = ADE_I18N[s.lang || "ru"] || ADE_I18N.ru;
  Object.keys(ADE_DEFAULTS.groups).forEach(function (k) {
    var on = !!s.enabled && !!s.groups[k];
    var pill = el("span", "pill");
    pill.appendChild(el("span", "badge " + (on ? "on" : "off"), on ? "ON" : "OFF"));
    pill.appendChild(document.createTextNode(" " + (dict[k] || k)));
    pill.setAttribute("data-testid", "group-status-" + k);
    box.appendChild(pill);
  });
}

function renderAnalytics(s) {
  var box = document.getElementById("analytics");
  box.innerHTML = "";
  var active = !!s.enabled && !!s.groups.analytics;
  var head = el("p", "hint", active
    ? "Group ON — SDK globals stubbed and vendor requests faked."
    : "Group OFF — analytics not neutralized in-page (network rules may still block).");
  box.appendChild(head);
  ANALYTICS_VENDORS.forEach(function (v) {
    var pill = el("span", "pill");
    pill.appendChild(el("span", "badge " + (active ? "on" : "off"), active ? "blocked" : "—"));
    pill.appendChild(document.createTextNode(" " + v));
    box.appendChild(pill);
  });
}

function renderRaw() {
  var box = document.getElementById("raw");
  box.innerHTML = "";
  var tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
  kv(box, "navigator.userAgent", navigator.userAgent);
  kv(box, "navigator.platform", navigator.platform);
  kv(box, "hardwareConcurrency", navigator.hardwareConcurrency);
  kv(box, "deviceMemory", navigator.deviceMemory);
  kv(box, "languages", (navigator.languages || []).join(", "));
  kv(box, "screen", screen.width + "×" + screen.height + " @" + window.devicePixelRatio + "x");
  kv(box, "timezone", tz);
  kv(box, "webdriver", navigator.webdriver);
}

adeGetSettings().then(function (s) {
  renderLegend(adeActiveProfile(s), s.mode);
  renderGroups(s);
  renderAnalytics(s);
  renderRaw();
  document.querySelectorAll("[data-i18n]").forEach(function (e) {
    var d = ADE_I18N[s.lang || "ru"] || ADE_I18N.ru, k = e.getAttribute("data-i18n");
    if (d[k]) e.textContent = d[k];
  });
});
