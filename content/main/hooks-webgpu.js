// MAIN world: WEBGPU — navigator.gpu adapter info aligned with the legend GPU.
// Detectors (fpscanner, neoprint) read GPUAdapter.info {vendor, architecture, device,
// description} and cross-check it against BOTH the WebGL renderer and the UA platform:
// WebGL saying "Intel" while WebGPU says "nvidia", or an "apple" vendor under a Windows
// UA, is an instant spoof verdict. Features/limits stay real (same-class GPUs share
// them); only the identifying strings come from the legend.
//
// Governed by the "webgl" group: WebGL and WebGPU are one GPU-identity surface.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  if (typeof GPU === "undefined" || !GPU.prototype || typeof GPUAdapter === "undefined") return;
  var GP = GPU.prototype, AP = GPUAdapter.prototype;

  function fakeInfo(realInfo) {
    var ST = M.ST, w = ST.wgpu;
    if (!w) return realInfo;
    var o = {};
    try { if (realInfo) Object.setPrototypeOf(o, Object.getPrototypeOf(realInfo)); } catch (e) {}
    ["vendor", "architecture", "device", "description"].forEach(function (k) {
      var g = function () { return w[k] || ""; };
      try {
        M.wmSet.call(M.fakeMap, g, "function get " + k + "() { [native code] }");
        M.defProp(g, "name", { value: "get " + k, configurable: true });
        M.defProp(o, k, { configurable: true, enumerable: true, get: g });
      } catch (e) {}
    });
    return o;
  }

  function wrapAdapter(adapter) {
    if (!adapter) return adapter;
    try {
      return new M.PX(adapter, {
        get: function (t, k) {
          if (k === "info") { try { return fakeInfo(t.info); } catch (e) {} }
          if (k === "requestAdapterInfo" && t.requestAdapterInfo) {
            return M.makeNative(function () {
              return t.requestAdapterInfo.apply(t, arguments).then(function (info) { return fakeInfo(info); });
            }, t.requestAdapterInfo);
          }
          // isFallbackAdapter: real discrete/integrated GPUs are never the fallback.
          if (k === "isFallbackAdapter") return false;
          var v = t[k];
          return typeof v === "function" ? v.bind(t) : v;
        }
      });
    } catch (e) { return adapter; }
  }

  M.hookMethod("webgl", GP, "requestAdapter", function (orig) {
    return function () {
      var p = orig.apply(this, arguments);
      if (!M.grp("webgl") || !M.ST.wgpu) return p;
      return p.then(function (adapter) {
        if (!adapter) return adapter;
        M.trigger("webgl");
        return wrapAdapter(adapter);
      });
    };
  });

  // Older Chrome shape: adapter.requestAdapterInfo() without the .info property.
  if (AP && M.gOPD(AP, "requestAdapterInfo")) {
    M.hookMethod("webgl", AP, "requestAdapterInfo", function (orig) {
      return function () {
        var p = orig.apply(this, arguments);
        if (!M.grp("webgl") || !M.ST.wgpu) return p;
        return p.then(function (info) { M.trigger("webgl"); return fakeInfo(info); });
      };
    });
  }
})();
