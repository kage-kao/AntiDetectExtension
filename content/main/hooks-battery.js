// MAIN world: BATTERY — legend charge state instead of a suspicious rejection.
//
// chrome.storage cannot represent Infinity (the key is silently dropped on write), so a
// stored "charging battery" legend arrives here with dTime === undefined. Real Chrome
// reports Infinity there — an undefined dischargingTime is an instant spoof tell. Coerce
// any missing/non-finite value back to Infinity at read time.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;
  var NP = typeof Navigator !== "undefined" ? Navigator.prototype : null;
  if (!NP) return;

  function finite(v, fallback) {
    return (typeof v === "number" && isFinite(v)) ? v : fallback;
  }

  M.hookMethod("battery", NP, "getBattery", function (orig) {
    return function () {
      if (!M.grp("battery")) return orig.apply(this, arguments);
      M.trigger("battery");
      try {
        var b = M.ST.battery || { charging: true, level: 1, cTime: 0, dTime: Infinity };
        var charging = !!b.charging;
        var level = finite(b.level, 1);
        if (level < 0 || level > 1) level = 1;
        // charging batteries report cTime 0 / dTime Infinity; discharging ones the reverse.
        var cTime = charging ? 0 : Infinity;
        var dTime = charging ? Infinity : finite(b.dTime, Infinity);
        var mgr = new EventTarget();
        M.defProp(mgr, "charging", { configurable: true, get: function () { return charging; } });
        M.defProp(mgr, "chargingTime", { configurable: true, get: function () { return cTime; } });
        M.defProp(mgr, "dischargingTime", { configurable: true, get: function () { return dTime; } });
        M.defProp(mgr, "level", { configurable: true, get: function () { return level; } });
        mgr.onchargingchange = null; mgr.onchargingtimechange = null;
        mgr.ondischargingtimechange = null; mgr.onlevelchange = null;
        try { M.defProp(mgr, Symbol.toStringTag, { value: "BatteryManager", configurable: true }); } catch (e) {}
        return Promise.resolve(mgr);
      } catch (e) { return orig.apply(this, arguments); }
    };
  });
})();
