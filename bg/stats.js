// SW module: per-tab statistics (blocked/spoofed counters), badge, popup reports.
// Stats live in storage.session so service-worker restarts keep them.

var DEBUG_MATCH = !!chrome.declarativeNetRequest.onRuleMatchedDebug;
var STATIC_SETS = ["ads", "trackers", "analytics", "annoyances", "social", "security"];

var tabStats = {};
var statsReady = chrome.storage.session.get("adeTabStats").then(function (d) {
  var saved = (d && d.adeTabStats) || {};
  Object.keys(saved).forEach(function (k) { if (!tabStats[k]) tabStats[k] = saved[k]; });
}).catch(function () {});

var saveTimer = null;
function saveStats() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () { chrome.storage.session.set({ adeTabStats: tabStats }).catch(function () {}); }, 400);
}
function freshStats(ts) { return { blocked: 0, spoof: 0, navStart: ts || Date.now(), domains: {}, seen: {} }; }
function statsFor(tabId) { return tabStats[tabId] || (tabStats[tabId] = freshStats()); }

// Packed builds have no onRuleMatchedDebug: Chrome shows the blocked-count badge itself.
chrome.action.setBadgeBackgroundColor({ color: "#b00020" }).catch(function () {});
if (!DEBUG_MATCH && chrome.declarativeNetRequest.setExtensionActionOptions) {
  chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true }).catch(function () {});
}

function setBadge(tabId) {
  if (!DEBUG_MATCH) return;
  var s = tabStats[tabId] || { blocked: 0, spoof: 0 };
  var total = s.blocked + s.spoof;
  chrome.action.setBadgeText({ tabId: tabId, text: total > 0 ? (total > 999 ? "999+" : String(total)) : "" }).catch(function () {});
}

function bump(tabId, kind, domain) {
  if (tabId < 0) return;
  var s = statsFor(tabId);
  s[kind]++;
  if (domain) s.domains[domain] = (s.domains[domain] || 0) + 1;
  setBadge(tabId);
  saveStats();
}

function isBlockRule(rulesetId, ruleId) {
  if (STATIC_SETS.indexOf(rulesetId) >= 0) return true;
  if (rulesetId === "_dynamic") return ruleId >= ADE_DYNAMIC_RULE_OFFSET && ruleId < 150000; // < whitelist offset (rules.js)
  return rulesetId === "_session" && ruleId >= 160000 && ruleId < 161500; // badger range (bg/badger.js)
}

if (DEBUG_MATCH) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(function (info) {
    var tabId = info.request && info.request.tabId;
    if (typeof tabId !== "number" || tabId < 0 || !isBlockRule(info.rule.rulesetId, info.rule.ruleId)) return;
    var host = "";
    try { host = new URL(info.request.url).hostname.replace(/^www\./, ""); } catch (e) {}
    bump(tabId, "blocked", host);
  });
}

var ruleDomains = null;
function loadRuleDomains() {
  if (ruleDomains) return Promise.resolve(ruleDomains);
  return Promise.all(STATIC_SETS.map(function (id) {
    return fetch(chrome.runtime.getURL("rules/rules_" + id + ".json")).then(function (r) { return r.json(); }).then(function (rules) {
      return rules.map(function (r) { return [id + ":" + r.id, adeDomainFromFilter(r.condition.urlFilter)]; });
    });
  })).then(function (lists) {
    var m = {};
    lists.forEach(function (l) { l.forEach(function (p) { m[p[0]] = p[1]; }); });
    ruleDomains = m;
    return m;
  });
}

// Packed mode: pull matched rules (DNR feedback) and merge them into the tab stats without double counting.
function buildReport(tabId) {
  return statsReady.then(function () {
    var s = statsFor(tabId);
    if (DEBUG_MATCH) return s;
    return Promise.all([loadRuleDomains(), chrome.declarativeNetRequest.getDynamicRules(), chrome.declarativeNetRequest.getSessionRules()]).then(function (res) {
      var map = res[0], dyn = {}, ses = {};
      res[1].forEach(function (r) { if (r.condition && r.condition.urlFilter) dyn[r.id] = adeDomainFromFilter(r.condition.urlFilter); });
      res[2].forEach(function (r) { if (r.condition && r.condition.urlFilter) ses[r.id] = adeDomainFromFilter(r.condition.urlFilter); });
      return chrome.declarativeNetRequest.getMatchedRules({ tabId: tabId, minTimeStamp: s.navStart }).then(function (info) {
        (info.rulesMatchedInfo || []).forEach(function (m) {
          var r = m.rule;
          if (!isBlockRule(r.rulesetId, r.ruleId)) return;
          var key = r.rulesetId + ":" + r.ruleId + ":" + m.timeStamp;
          if (s.seen[key]) return;
          s.seen[key] = 1;
          s.blocked++;
          var dom = r.rulesetId === "_dynamic" ? dyn[r.ruleId]
            : r.rulesetId === "_session" ? ses[r.ruleId]
            : map[r.rulesetId + ":" + r.ruleId];
          if (dom) s.domains[dom] = (s.domains[dom] || 0) + 1;
        });
        saveStats();
        return s;
      });
    }).catch(function () { return s; });
  });
}
