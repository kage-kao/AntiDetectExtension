// MAIN world: STEALTH + permissions + ad-tech APIs + GPC.
// (navigator.languages is owned by the combined "langq" hook in hooks-intl.js.)

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;
  var NP = typeof Navigator !== "undefined" ? Navigator.prototype : null;

  // webdriver = false
  if (NP) {
    M.hookGetter("stealth", NP, "webdriver", function () { M.trigger("stealth"); return false; });
  }

  // PERMISSIONS combined query (stealth notifications + geo geolocation)
  try {
    if (typeof Permissions !== "undefined" && Permissions.prototype) {
      M.hookMethod("privq", Permissions.prototype, "query", function (orig) {
        return function (desc) {
          try {
            if (desc && desc.name === "notifications" && M.grp("stealth") && typeof Notification !== "undefined") {
              M.trigger("stealth");
              var st = Notification.permission === "default" ? "prompt" : Notification.permission;
              return Promise.resolve({ state: st, onchange: null, name: "notifications" });
            }
            if (desc && desc.name === "geolocation" && M.grp("geo") && M.ST.lat !== null && M.ST.lat !== undefined) {
              M.trigger("geo");
              return Promise.resolve({ state: "granted", onchange: null, name: "geolocation" });
            }
          } catch (e) {}
          return orig.apply(this, arguments);
        };
      });
    }
  } catch (e) {}

  // ADTECH — Topics API / Protected Audience (FLEDGE) return "nothing to share"
  (function () {
    function resolved(v) { return function () { M.trigger("adtech"); return Promise.resolve(v); }; }
    if (typeof Document !== "undefined") M.hookMethod("adtech", Document.prototype, "browsingTopics", function () { return resolved([]); });
    if (NP) {
      M.hookMethod("adtech", NP, "joinAdInterestGroup", function () { return resolved(undefined); });
      M.hookMethod("adtech", NP, "leaveAdInterestGroup", function () { return resolved(undefined); });
      M.hookMethod("adtech", NP, "clearOriginJoinedAdInterestGroups", function () { return resolved(undefined); });
      M.hookMethod("adtech", NP, "runAdAuction", function () { return resolved(null); });
    }
  })();

  // GPC — navigator.globalPrivacyControl === true (Sec-GPC header is set via DNR)
  (function () {
    if (!NP) return;
    if (M.gOPD(NP, "globalPrivacyControl")) {
      M.hookGetter("gpc", NP, "globalPrivacyControl", function () { return true; });
      return;
    }
    var g = function () { return true; };
    try {
      M.wmSet.call(M.fakeMap, g, "function get globalPrivacyControl() { [native code] }");
      M.defProp(g, "name", { value: "get globalPrivacyControl", configurable: true });
    } catch (e) {}
    M.reg("gpc", NP, "globalPrivacyControl", null, { get: g, set: undefined, enumerable: true, configurable: true });
  })();
})();
