// MAIN world: UA-CH — NavigatorUAData faked from the legend; high-entropy values aligned.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;
  var NP = typeof Navigator !== "undefined" ? Navigator.prototype : null;
  if (!NP) return;

  var cache = null, cacheKey = null;

  function uaData() {
    var ST = M.ST;
    var key = ST.legendId || ST.seed;
    if (cache && cacheKey === key) return cache;
    var o = {
      brands: ST.brands ? ST.brands.map(function (b) { return { brand: b.brand, version: b.version }; }) : [],
      mobile: ST.mobile,
      platform: ST.uaPlat,
      getHighEntropyValues: M.makeNative(function (hints) {
        var vals = { brands: o.brands, mobile: o.mobile, platform: o.platform };
        try {
          (hints || []).forEach(function (k) {
            if (k === "architecture") vals.architecture = ST.arch;
            else if (k === "bitness") vals.bitness = ST.bitness;
            else if (k === "brands") vals.brands = o.brands;
            else if (k === "fullVersionList") vals.fullVersionList = ST.fullBrands || o.brands;
            else if (k === "mobile") vals.mobile = o.mobile;
            else if (k === "model") vals.model = ST.model;
            else if (k === "platform") vals.platform = o.platform;
            else if (k === "platformVersion") vals.platformVersion = ST.pv;
            else if (k === "uaFullVersion") vals.uaFullVersion = ST.chrome;
            else if (k === "wow64") vals.wow64 = false;
          });
        } catch (e) {}
        try { M.trigger("uach"); } catch (err) {}
        return Promise.resolve(vals);
      }, (typeof NavigatorUAData !== "undefined" && NavigatorUAData.prototype && NavigatorUAData.prototype.getHighEntropyValues) || Promise.resolve),
      toJSON: function () { return { brands: o.brands, mobile: o.mobile, platform: o.platform }; }
    };
    try { M.defProp(o, Symbol.toStringTag, { value: "NavigatorUAData", configurable: true }); } catch (e) {}
    // instanceof NavigatorUAData must hold (CreepJS/fpscanner check the prototype chain).
    try { if (typeof NavigatorUAData !== "undefined" && NavigatorUAData.prototype) Object.setPrototypeOf(o, NavigatorUAData.prototype); } catch (e) {}
    cache = o;
    cacheKey = key;
    return o;
  }

  M.hookGetter("uach", NP, "userAgentData", function (v) {
    if (!M.ST.brands) return v;
    M.trigger("uach");
    return uaData();
  });

  if (typeof NavigatorUAData !== "undefined") {
    M.hookMethod("uach", NavigatorUAData.prototype, "getHighEntropyValues", function (orig) {
      return function (hints) {
        if (!M.grp("uach") || !M.ST.brands) return orig.apply(this, arguments);
        return uaData().getHighEntropyValues(hints);
      };
    });
  }
})();
