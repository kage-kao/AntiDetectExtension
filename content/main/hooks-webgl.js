// MAIN world: WEBGL — legend vendor/renderer plus a consistent capability set
// (see state.js for the parameter profile). ReadPixels gets light seeded noise.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  function patch(proto, isV2) {
    if (!proto) return;
    M.hookMethod("webgl", proto, "getParameter", function (orig) {
      return function (p) {
        if (M.grp("webgl")) {
          var v = M.adeGlParam(isV2, p);
          if (v !== undefined) { M.trigger("webgl"); return v; }
        }
        return orig.apply(this, arguments);
      };
    });
    M.hookMethod("webgl", proto, "getSupportedExtensions", function (orig) {
      return function () {
        if (M.grp("webgl")) { M.trigger("webgl"); return (isV2 ? M.GL_EXT2 : M.GL_EXT1).slice(); }
        return orig.apply(this, arguments);
      };
    });
    M.hookMethod("webgl", proto, "getShaderPrecisionFormat", function (orig) {
      return function (shaderTypeArg, precType) {
        var real = orig.apply(this, arguments);
        if (!M.grp("webgl") || !real) return real;
        try {
          var fake = M.adeShaderPrec(precType);
          var o = { rangeMin: fake.rangeMin, rangeMax: fake.rangeMax, precision: fake.precision };
          try { M.defProp(o, Symbol.toStringTag, { value: "WebGLShaderPrecisionFormat", configurable: true }); } catch (e) {}
          return o;
        } catch (e) { return real; }
      };
    });
    M.hookMethod("webgl", proto, "getExtension", function (orig) {
      return function (name) {
        var ext = orig.apply(this, arguments);
        if (M.grp("webgl") && !ext && String(name).toLowerCase() === "webgl_debug_renderer_info") {
          try {
            var fake = { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
            try { M.defProp(fake, Symbol.toStringTag, { value: "WebGLDebugRendererInfo", configurable: true }); } catch (e) {}
            return fake;
          } catch (e) {}
        }
        return ext;
      };
    });
    M.hookMethod("webgl", proto, "readPixels", function (orig) {
      return function () {
        var res = orig.apply(this, arguments);
        if (M.grp("webgl")) {
          try {
            var px = arguments[6];
            if (px && px.length) {
              for (var i = 0; i < px.length; i += 17) if (M.hash(i + 7) < 0.5) px[i] = px[i] ^ 1;
              M.trigger("webgl");
            }
          } catch (e) {}
        }
        return res;
      };
    });
  }

  if (typeof WebGLRenderingContext !== "undefined") patch(WebGLRenderingContext.prototype, false);
  if (typeof WebGL2RenderingContext !== "undefined") patch(WebGL2RenderingContext.prototype, true);
})();
