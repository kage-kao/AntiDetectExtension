// MAIN world, module 2: spoof-state derivation.
// ST (M.ST) is derived from a stable legend, or — per-visit / boot window — from a random
// seed. The per-visit path is FULLY SYNTHETIC: nothing real (UA, platform, language, TZ)
// is ever exposed, not even during the milliseconds before EV_CFG arrives. Only the OS
// stays real, because JS values must agree with the TLS/HTTP stack we cannot change.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;
  var mFloor = M.mFloor;

  // ---- derive full spoof state from a legend (stable) or synthetically (per-visit) ----
  M.derive = function (legend) {
    var stable = !!(legend && legend.id);
    var seed = stable ? (legend.seed >>> 0) : M.rand32();
    var realOS = M.detectOS();
    var st = { seed: seed, stable: stable, mode: stable ? "stable" : "per-visit", legendId: stable ? legend.id : null };

    if (stable) {
      st.os = legend.os; st.gpuV = legend.gpuVendor; st.gpuR = legend.gpuRenderer;
      st.hc = legend.cores; st.dm = legend.ram; st.pv = legend.platformVersion; st.touch = legend.touch;
      st.scrW = legend.screenW; st.scrH = legend.screenH; st.dpr = legend.dpr; st.depth = legend.depth || 24;
      st.ua = legend.ua; st.platform = legend.platform; st.vendor = "Google Inc.";
      st.uaPlat = legend.uaPlatform; st.chrome = legend.chrome; st.arch = legend.arch || "x86";
      st.bitness = legend.bitness || "64"; st.model = legend.model || ""; st.mobile = !!legend.mobile;
      st.locale = legend.locale; st.langs = legend.langs.slice(); st.acceptLang = legend.acceptLang;
      st.tzName = legend.tzName; st.tzStd = legend.tzStd; st.tzRule = legend.tzDst || "none";
      st.lat = legend.lat; st.lon = legend.lon; st.acc = legend.acc || 25;
      st.sampleRate = legend.sampleRate || 48000; st.battery = legend.battery;
      st.fonts = legend.fonts.slice();
      st.wgpu = legend.webgpu || ADE_webgpuFor(legend.gpuVendor, legend.gpuRenderer);
    } else {
      var h = function (n) { return M.hashSeed(seed, n); };
      var os = realOS;
      var pre = ADE_PRESETS[mFloor(h(401) * ADE_PRESETS.length)];
      var gpool = ADE_GPU_POOLS[os], g = gpool[mFloor(h(101) * gpool.length)];
      var hw = ADE_HW_PAIRS[mFloor(h(201) * ADE_HW_PAIRS.length)];
      var chromeV = ADE_CHROME_POOL[mFloor(h(501) * ADE_CHROME_POOL.length)];
      st.os = os;
      st.gpuV = g[0]; st.gpuR = g[1];
      st.hc = hw[0]; st.dm = hw[1];
      st.pv = ADE_PV[os][mFloor(h(203) * ADE_PV[os].length)];
      st.touch = os === "win" && h(207) < 0.15 ? 5 : 0;
      var ow = 0;
      try { ow = window.outerWidth || 0; } catch (e) {}
      var sizes = ADE_SCREENS.filter(function (s) { return s[0] >= ow; });
      var sc = sizes.length ? sizes[mFloor(h(301) * sizes.length)] : ADE_SCREENS[4];
      st.scrW = sc[0]; st.scrH = sc[1]; st.dpr = 1; st.depth = 24;
      st.chrome = chromeV;
      st.ua = ADE_buildUA(os, chromeV);
      st.appVer = st.ua.replace(/^Mozilla\//, "");
      st.platform = ADE_platformFor(os);
      st.vendor = "Google Inc.";
      st.uaPlat = ADE_uaPlatformFor(os);
      st.arch = os === "mac" ? "arm" : "x86"; st.bitness = "64"; st.model = ""; st.mobile = false;
      st.locale = pre.locale; st.langs = pre.langs.slice(); st.acceptLang = ADE_acceptLang(pre);
      st.tzName = pre.tz; st.tzStd = pre.std; st.tzRule = pre.dst;
      st.lat = pre.lat; st.lon = pre.lon; st.acc = pre.acc;
      st.sampleRate = h(601) < 0.6 ? 48000 : 44100;
      st.battery = h(701) < 0.5
        ? { charging: true, level: 1, cTime: 0, dTime: Infinity }
        : { charging: false, level: Math.round((0.55 + h(702) * 0.4) * 100) / 100, cTime: Infinity, dTime: Math.round(2000 + h(703) * 20000) };
      st.fonts = ADE_FONTS[os].slice();
      st.wgpu = ADE_webgpuFor(g[0], g[1]);
    }
    if (stable || !st.appVer) st.appVer = st.ua ? st.ua.replace(/^Mozilla\//, "") : null;
    var major = st.chrome ? st.chrome.split(".")[0] : null;
    st.brandMajor = major;
    var grease = ADE_greaseBrand(major);
    st.brands = major
      ? [{ brand: "Chromium", version: major }, { brand: "Google Chrome", version: major }, { brand: grease.brand, version: grease.version }]
      : null;
    st.fullBrands = (major && st.chrome)
      ? [{ brand: "Chromium", version: st.chrome }, { brand: "Google Chrome", version: st.chrome }, { brand: grease.brand, version: grease.fullVersion }]
      : null;
    var r2 = ADE_mulberry(seed ^ 0x5bd1e995);
    st.rectEx = (r2() * 2 - 1) * 1e-4; st.rectEy = (r2() * 2 - 1) * 1e-4; st.rectEs = (r2() * 2 - 1) * 1e-5;
    st.fontK = 1 + (r2() * 2 - 1) * 3e-4;
    st.bar = st.os === "mac" ? 25 : 40;
    return st;
  };

  // Initial state: per-visit synthetic until the bridge delivers the legend via EV_CFG.
  M.ST = M.derive(null);

  // ---- WebGL capability profiles (shared by hooks-webgl and the worker payload) ----
  M.GL_EXT1 = ["ANGLE_instanced_arrays", "EXT_blend_minmax", "EXT_clip_control", "EXT_color_buffer_half_float",
    "EXT_depth_clamp", "EXT_disjoint_timer_query", "EXT_float_blend", "EXT_frag_depth", "EXT_polygon_offset_clamp",
    "EXT_shader_texture_lod", "EXT_texture_compression_bptc", "EXT_texture_compression_rgtc",
    "EXT_texture_filter_anisotropic", "EXT_texture_mirror_clamp_to_edge", "EXT_sRGB", "KHR_parallel_shader_compile",
    "OES_element_index_uint", "OES_fbo_render_mipmap", "OES_standard_derivatives", "OES_texture_float",
    "OES_texture_float_linear", "OES_texture_half_float", "OES_texture_half_float_linear", "OES_vertex_array_object",
    "WEBGL_blend_func_extended", "WEBGL_color_buffer_float", "WEBGL_compressed_texture_s3tc",
    "WEBGL_compressed_texture_s3tc_srgb", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_depth_texture",
    "WEBGL_draw_buffers", "WEBGL_lose_context", "WEBGL_multi_draw", "WEBGL_polygon_mode"];
  M.GL_EXT2 = ["EXT_clip_control", "EXT_color_buffer_float", "EXT_color_buffer_half_float", "EXT_depth_clamp",
    "EXT_disjoint_timer_query_webgl2", "EXT_float_blend", "EXT_polygon_offset_clamp", "EXT_render_snorm",
    "EXT_texture_compression_bptc", "EXT_texture_compression_rgtc", "EXT_texture_filter_anisotropic",
    "EXT_texture_mirror_clamp_to_edge", "EXT_texture_norm16", "KHR_parallel_shader_compile", "NV_shader_noperspective_interpolation",
    "OES_draw_buffers_indexed", "OES_sample_variables", "OES_shader_multisample_interpolation", "OES_texture_float_linear",
    "OVR_multiview2", "WEBGL_blend_func_extended", "WEBGL_clip_cull_distance", "WEBGL_compressed_texture_s3tc",
    "WEBGL_compressed_texture_s3tc_srgb", "WEBGL_debug_renderer_info", "WEBGL_debug_shaders", "WEBGL_lose_context",
    "WEBGL_multi_draw", "WEBGL_polygon_mode", "WEBGL_provoking_vertex", "WEBGL_stencil_texturing"];

  // A coherent "typical desktop Chrome/ANGLE" profile for the whole GL read surface —
  // faking only UNMASKED_VENDOR/RENDERER while MAX_*, precision and VERSION strings leak
  // the real GPU both unmasks the machine and contradicts the fake renderer.
  M.GL_PARAM_IDS = [37445, 37446, 7936, 7937, 7938, 35724, 3379, 34076, 34024, 3386,
    34930, 35660, 35661, 34921, 36347, 36349, 36348, 33901, 33902, 34852, 34047];
  M.GL2_EXTRA_PARAM_IDS = [32883, 35071, 36063];

  M.adeGlParam = function (isV2, p) {
    var ST = M.ST;
    switch (p) {
      case 37445: return ST.gpuV;                                          // UNMASKED_VENDOR_WEBGL
      case 37446: return ST.gpuR;                                          // UNMASKED_RENDERER_WEBGL
      case 7936: return "WebKit";                                          // VENDOR
      case 7937: return "WebKit WebGL";                                    // RENDERER
      case 7938: return isV2 ? "WebGL 2.0 (OpenGL ES 3.0 Chromium)" : "WebGL 1.0 (OpenGL ES 2.0 Chromium)";
      case 35724: return isV2 ? "WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)" : "WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)";
      case 3379: case 34076: case 34024: return 16384;                     // MAX_TEXTURE / CUBE / RENDERBUFFER SIZE
      case 3386: return new Int32Array([32767, 32767]);                    // MAX_VIEWPORT_DIMS
      case 34930: case 35660: return 16;                                   // MAX_(VERTEX_)TEXTURE_IMAGE_UNITS
      case 35661: return 32;                                               // MAX_COMBINED_TEXTURE_IMAGE_UNITS
      case 34921: return 16;                                               // MAX_VERTEX_ATTRIBS
      case 36347: return 4096;                                             // MAX_VERTEX_UNIFORM_VECTORS
      case 36349: return 1024;                                             // MAX_FRAGMENT_UNIFORM_VECTORS
      case 36348: return 30;                                               // MAX_VARYING_VECTORS
      case 33901: return new Float32Array([1, 1024]);                      // ALIASED_POINT_SIZE_RANGE
      case 33902: return new Float32Array([1, 1]);                         // ALIASED_LINE_WIDTH_RANGE
      case 34852: return 8;                                                // MAX_DRAW_BUFFERS
      case 34047: return 16;                                               // MAX_TEXTURE_MAX_ANISOTROPY_EXT
      case 32883: return isV2 ? 2048 : undefined;                          // MAX_3D_TEXTURE_SIZE
      case 35071: return isV2 ? 2048 : undefined;                          // MAX_ARRAY_TEXTURE_LAYERS
      case 36063: return isV2 ? 8 : undefined;                             // MAX_COLOR_ATTACHMENTS
    }
    return undefined;
  };

  M.adeShaderPrec = function (shaderType) {
    // 36338 HIGH_FLOAT / 36337 MEDIUM_FLOAT / 36336 LOW_FLOAT -> desktop highp float
    if (shaderType >= 36336 && shaderType <= 36338) return { rangeMin: 127, rangeMax: 127, precision: 23 };
    return { rangeMin: 31, rangeMax: 30, precision: 0 };
  };

  // JSON-safe GL table for the worker payload: {param: {v}|{i:[..]}|{f:[..]}}.
  M.glTable = function (isV2) {
    var t = {};
    M.GL_PARAM_IDS.concat(isV2 ? M.GL2_EXTRA_PARAM_IDS : []).forEach(function (p) {
      var v = M.adeGlParam(isV2, p);
      if (v === undefined) return;
      if (v instanceof Int32Array) t[p] = { i: [v[0], v[1]] };
      else if (v instanceof Float32Array) t[p] = { f: [v[0], v[1]] };
      else t[p] = { v: v };
    });
    return t;
  };
})();
