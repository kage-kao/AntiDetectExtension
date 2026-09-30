// MAIN world: SCREEN — legend resolution, depth, DPR, orientation, and window geometry
// that must not contradict the fake screen. A real maximized window (e.g. 1920 inner px)
// leaking next to a spoofed 1536px screen is an instant "window larger than the monitor"
// signal, so inner/outer dimensions are clamped into the legend's geometry.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  var SP = typeof Screen !== "undefined" ? Screen.prototype : null;
  if (SP) {
    M.hookGetter("screen", SP, "width", function () { M.trigger("screen"); return M.ST.scrW; });
    M.hookGetter("screen", SP, "height", function () { return M.ST.scrH; });
    M.hookGetter("screen", SP, "availWidth", function () { return M.ST.scrW; });
    M.hookGetter("screen", SP, "availHeight", function () { return M.ST.scrH - M.ST.bar; });
    M.hookGetter("screen", SP, "availLeft", function () { return 0; });
    M.hookGetter("screen", SP, "availTop", function () { return 0; });
    M.hookGetter("screen", SP, "colorDepth", function () { return M.ST.depth; });
    M.hookGetter("screen", SP, "pixelDepth", function () { return M.ST.depth; });
    try {
      if (typeof ScreenOrientation !== "undefined" && ScreenOrientation.prototype) {
        M.hookGetter("screen", ScreenOrientation.prototype, "type", function () { return M.ST.scrW >= M.ST.scrH ? "landscape-primary" : "portrait-primary"; });
        M.hookGetter("screen", ScreenOrientation.prototype, "angle", function () { return 0; });
      }
    } catch (e) {}
  }

  // devicePixelRatio may sit on the window instance or Window.prototype depending on build.
  try { M.hookGetter("screen", window, "devicePixelRatio", function () { return M.ST.dpr; }); } catch (e) {}
  try {
    if (typeof Window !== "undefined" && Window.prototype) M.hookGetter("screen", Window.prototype, "devicePixelRatio", function () { return M.ST.dpr; });
  } catch (e) {}

  // Window geometry. These live on the window INSTANCE, not on Window.prototype.
  // A maximized browser has outerHeight == availHeight and inner == outer minus the tab
  // strip, so the clamps below produce that same, coherent shape.
  var TAB_STRIP = 76; // typical height of Chrome's tab strip + toolbar in CSS px
  function availH() { return M.ST.scrH - M.ST.bar; }
  function clamp(v, cap) { v = +v || 0; return (v && v > cap) ? cap : v; }

  try {
    M.hookGetter("screen", window, "screenX", function () { return 0; });
    M.hookGetter("screen", window, "screenY", function () { return 0; });
    M.hookGetter("screen", window, "screenLeft", function () { return 0; });
    M.hookGetter("screen", window, "screenTop", function () { return 0; });
    M.hookGetter("screen", window, "outerWidth", function (v) { return clamp(v, M.ST.scrW); });
    M.hookGetter("screen", window, "outerHeight", function (v) { return clamp(v, availH()); });
    M.hookGetter("screen", window, "innerWidth", function (v) { return clamp(v, M.ST.scrW); });
    M.hookGetter("screen", window, "innerHeight", function (v) { return clamp(v, M.mMax(availH() - TAB_STRIP, 200)); });
  } catch (e) {}

  // matchMedia: resolution / device-pixel-ratio / color-gamut / dynamic-range must agree
  // with the spoofed screen & DPR (a real display leaking here contradicts screen.*).
  // Same for device-width/device-height/device-aspect-ratio (screen-level features) and
  // the display/preference bits fingerprintjs collects (monochrome, inverted-colors,
  // forced-colors, prefers-contrast/reduced-*). Viewport width/height/orientation are
  // deliberately NOT touched: CSS lays out against the real viewport, so spoofing those
  // would contradict the rendered page (its own spoof signal).
  (function () {
    function dprCmp(range, target) {
      var d = M.ST.dpr;
      if (range === "min-") return d >= target;
      if (range === "max-") return d <= target;
      return M.mAbs(d - target) < 1e-3;
    }
    function lenCmp(range, actual, target) {
      if (range === "min-") return actual >= target;
      if (range === "max-") return actual <= target;
      return M.mAbs(actual - target) < 1;
    }
    function touched(q) {
      return /device-pixel-ratio|resolution|color-gamut|dynamic-range|device-width|device-height|device-aspect-ratio|monochrome|inverted-colors|forced-colors|prefers-contrast|prefers-reduced/i.test(String(q));
    }
    function evalSeg(seg) {
      seg = String(seg).replace(/^[()\s]+|[()\s]+$/g, "");
      if (!seg || seg.indexOf("not ") === 0) return undefined; // 'not' inverts — leave to the real engine
      var m = seg.match(/(min-|max-)?(?:-webkit-)?device-pixel-ratio\s*:\s*([\d.]+)/);
      if (m) return dprCmp(m[1], parseFloat(m[2]));
      m = seg.match(/(min-|max-)?resolution\s*:\s*([\d.]+)(dppx|x|dpi|dpcm)/);
      if (m) {
        var val = parseFloat(m[2]), unit = m[3];
        var dppx = unit === "dpi" ? val / 96 : (unit === "dpcm" ? val / 37.795 : val);
        return dprCmp(m[1], dppx);
      }
      m = seg.match(/(min-|max-)?device-width\s*:\s*([\d.]+)px/);
      if (m) return lenCmp(m[1], M.ST.scrW, parseFloat(m[2]));
      m = seg.match(/(min-|max-)?device-height\s*:\s*([\d.]+)px/);
      if (m) return lenCmp(m[1], M.ST.scrH, parseFloat(m[2]));
      m = seg.match(/device-aspect-ratio\s*:\s*(\d+)\s*\/\s*(\d+)/);
      if (m) return M.mAbs(M.ST.scrW / M.ST.scrH - (+m[1]) / (+m[2])) < 0.02;
      if (/color-gamut\s*:\s*srgb/.test(seg)) return true;
      if (/color-gamut\s*:\s*(p3|rec2020)/.test(seg)) return false;
      if (/dynamic-range\s*:\s*standard/.test(seg)) return true;
      if (/dynamic-range\s*:\s*high/.test(seg)) return false;
      if (/prefers-reduced-motion\s*:\s*no-preference/.test(seg)) return true;
      if (/prefers-reduced-motion\s*:\s*reduce/.test(seg)) return false;
      if (/prefers-reduced-transparency\s*:\s*no-preference/.test(seg)) return true;
      if (/prefers-reduced-transparency\s*:\s*reduce/.test(seg)) return false;
      if (/prefers-contrast\s*:\s*no-preference/.test(seg)) return true;
      if (/prefers-contrast\s*:\s*(more|less|custom)/.test(seg)) return false;
      if (/inverted-colors\s*:\s*none/.test(seg)) return true;
      if (/inverted-colors\s*:\s*inverted/.test(seg)) return false;
      if (/forced-colors\s*:\s*none/.test(seg)) return true;
      if (/forced-colors\s*:\s*active/.test(seg)) return false;
      if (/monochrome\s*:\s*0/.test(seg)) return true;
      if (/monochrome\s*:\s*[1-9]/.test(seg)) return false;
      if (/^monochrome$/.test(seg)) return false;
      return undefined;
    }
    function fix(q, real) {
      try {
        var parts = String(q).toLowerCase().split(/\s+and\s+/);
        var acc = null;
        for (var i = 0; i < parts.length; i++) {
          var r = evalSeg(parts[i]);
          if (r === undefined) continue;
          acc = (acc === null) ? r : (acc && r);
        }
        return acc === null ? real : acc;
      } catch (e) { return real; }
    }
    function mmFactory(orig) {
      return function (q) {
        var mql = orig.apply(this, arguments);
        if (!M.grp("screen") || !mql || !touched(q)) return mql;
        try {
          M.trigger("screen");
          var faked = fix(q, mql.matches);
          return new M.PX(mql, { get: function (t, k) {
            if (k === "matches") return faked;
            var v = t[k];
            return typeof v === "function" ? v.bind(t) : v;
          } });
        } catch (e) { return mql; }
      };
    }
    M.hookMethod("screen", window, "matchMedia", mmFactory);
    if (typeof Window !== "undefined" && Window.prototype) M.hookMethod("screen", Window.prototype, "matchMedia", mmFactory);
  })();
})();
