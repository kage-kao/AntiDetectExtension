// AntiDetectExtension v2 — MAIN world hooks. Stable legend profiles + per-visit fallback.
// Runs at document_start. Legend arrives synchronously via localStorage mirror (written by the
// ISOLATED bridge on the previous pageview) and live via EV_CFG. First-ever pageview uses a
// per-visit seed but NEVER switches mid-page: a page is always internally consistent.

(function () {
  "use strict";
  var EV_CFG = "__ade_v2_cfg", EV_TRIG = "__ade_v2_trig", EV_PING = "__ade_v2_ping", LS_KEY = "__ade_v2";

  var boot = null;
  try { boot = self.__ade_flags || null; delete self.__ade_flags; } catch (e) {}

  try {
    var h0 = (location.hostname || "").replace(/^www\./, "").toLowerCase();
    if (h0 === "challenges.cloudflare.com" || h0.endsWith(".challenges.cloudflare.com") ||
        h0 === "turnstile.cloudflare.com" || /\/cdn-cgi\/challenge-platform\//.test(location.pathname || "")) return;
  } catch (e) {}

  var gOPD = Object.getOwnPropertyDescriptor, defProp = Object.defineProperty;
  var addEL = EventTarget.prototype.addEventListener, dispatchEv = EventTarget.prototype.dispatchEvent;
  var CE = CustomEvent, jsonParse = JSON.parse, jsonStringify = JSON.stringify;
  var slice = Array.prototype.slice;
  var mFloor = Math.floor, mImul = Math.imul, mMax = Math.max, mAbs = Math.abs;
  var nativeToString = Function.prototype.toString;
  var wmGet = WeakMap.prototype.get, wmHas = WeakMap.prototype.has, wmSet = WeakMap.prototype.set;
  var RConstruct = Reflect.construct, PX = Proxy;

  try { if (!dispatchEv.call(window, new CE(EV_PING, { cancelable: true }))) return; } catch (e) {}
  addEL.call(window, EV_PING, function (e) { e.preventDefault(); e.stopImmediatePropagation(); });

  var GROUPS = ["canvas", "webgl", "audio", "rects", "fonts", "navigator", "screen", "uach",
    "locale", "geo", "timezone", "webrtc", "battery", "media", "beacon", "analytics", "sensors", "workers", "stealth"];
  var cfg = { active: !!(boot && boot.on), groups: {}, mode: "stable", legend: null };
  for (var gi = 0; gi < GROUPS.length; gi++) cfg.groups[GROUPS[gi]] = !!(boot && boot[GROUPS[gi]]);
  function grp(n) { return cfg.active && !!cfg.groups[n]; }

  function rand32() {
    try { var sa = new Uint32Array(1); crypto.getRandomValues(sa); return sa[0]; }
    catch (e) { return (Math.random() * 4294967296) >>> 0; }
  }
  function detectOS() {
    var p = "";
    try { p = String(navigator.platform || "") + " " + String(navigator.userAgent || ""); } catch (e) {}
    if (/Mac/i.test(p)) return "mac";
    if (/Win/i.test(p)) return "win";
    return "linux";
  }

  // ---- derive full spoof state from a legend (stable) or randomly (per-visit) ----
  function derive(legend) {
    var stable = !!(legend && legend.id);
    var seed = stable ? (legend.seed >>> 0) : rand32();
    var rnd = ADE_mulberry(seed);
    var pick = function (a) { return a[mFloor(rnd() * a.length)]; };
    var realOS = detectOS();
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
    } else {
      var os = realOS;
      st.os = os;
      var pools = ADE_GPU_POOLS[os], g = pools[mFloor(hash0(seed, 101) * pools.length)];
      st.gpuV = g[0]; st.gpuR = g[1];
      var hw = [[4, 4], [6, 8], [8, 8], [8, 16], [12, 16], [16, 32]][mFloor(hash0(seed, 201) * 6)];
      st.hc = hw[0]; st.dm = hw[1];
      st.pv = ADE_PV[os][mFloor(hash0(seed, 203) * ADE_PV[os].length)];
      st.touch = 0;
      var ow = 0;
      try { ow = window.outerWidth || 0; } catch (e) {}
      var sizes = ADE_SCREENS.filter(function (s) { return s[0] >= ow; });
      var sc = sizes.length ? sizes[mFloor(hash0(seed, 301) * sizes.length)] : ADE_SCREENS[4];
      st.scrW = sc[0]; st.scrH = sc[1]; st.dpr = 1; st.depth = 24;
      st.ua = null; st.platform = null; st.vendor = "Google Inc.";
      st.uaPlat = os === "win" ? "Windows" : (os === "mac" ? "macOS" : "Linux");
      st.chrome = null; st.arch = "x86"; st.bitness = "64"; st.model = ""; st.mobile = false;
      try {
        st.locale = navigator.language || "en-US";
        st.langs = navigator.languages && navigator.languages.length ? slice.call(navigator.languages) : [st.locale];
      } catch (e) { st.locale = "en-US"; st.langs = ["en-US"]; }
      st.acceptLang = null;
      var PRE = [["America/New_York", 300], ["America/Chicago", 360], ["America/Denver", 420],
        ["America/Los_Angeles", 480], ["Europe/London", 0], ["Europe/Berlin", -60],
        ["Europe/Paris", -60], ["Europe/Madrid", -60], ["Europe/Moscow", -180],
        ["Asia/Tokyo", -540], ["Australia/Sydney", -600]];
      var TZ = PRE[mFloor(hash0(seed, 401) * PRE.length)];
      st.tzName = TZ[0]; st.tzStd = TZ[1]; st.tzRule = "none";
      var gp = ADE_PRESETS[mFloor(rnd() * ADE_PRESETS.length)];
      st.lat = gp.lat; st.lon = gp.lon; st.acc = gp.acc;
      st.sampleRate = pick([44100, 48000]);
      st.battery = rnd() < 0.5
        ? { charging: true, level: 1, cTime: 0, dTime: Infinity }
        : { charging: false, level: Math.round((0.55 + rnd() * 0.4) * 100) / 100, cTime: Infinity, dTime: Math.round(2000 + rnd() * 20000) };
      st.fonts = ADE_FONTS[os].slice();
    }
    st.appVer = st.ua ? st.ua.replace(/^Mozilla\//, "") : null;
    var major = st.chrome ? st.chrome.split(".")[0] : null;
    st.brandMajor = major;
    st.brands = major
      ? [{ brand: "Chromium", version: major }, { brand: "Google Chrome", version: major }, { brand: "Not-A.Brand", version: "24" }]
      : null;
    st.fullBrands = (major && st.chrome)
      ? [{ brand: "Chromium", version: st.chrome }, { brand: "Google Chrome", version: st.chrome }, { brand: "Not-A.Brand", version: "24.0.0.0" }]
      : null;
    var r2 = ADE_mulberry(seed ^ 0x5bd1e995);
    st.rectEx = (r2() * 2 - 1) * 1e-4; st.rectEy = (r2() * 2 - 1) * 1e-4; st.rectEs = (r2() * 2 - 1) * 1e-5;
    st.fontK = 1 + (r2() * 2 - 1) * 3e-4;
    st.bar = st.os === "mac" ? 25 : 40;
    return st;
  }
  function hash0(seed, n) {
    var x = (seed ^ mImul(n | 0, 0x9E3779B1)) >>> 0;
    x = mImul(x ^ (x >>> 16), 0x85EBCA6B); x = mImul(x ^ (x >>> 13), 0xC2B2AE35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  function readMirror() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      var o = jsonParse(raw);
      if (o && o.mode === "stable" && o.legend && o.legend.id) return o.legend;
    } catch (e) {}
    return null;
  }

  cfg.legend = readMirror();
  var ST = derive(cfg.legend);

  function hash(n) {
    var x = (ST.seed ^ mImul(n | 0, 0x9E3779B1)) >>> 0;
    x = mImul(x ^ (x >>> 16), 0x85EBCA6B); x = mImul(x ^ (x >>> 13), 0xC2B2AE35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  }

  var reported = 0;
  function trigger(kind) {
    if (reported++ % 3) return;
    try { dispatchEv.call(window, new CE(EV_TRIG, { detail: kind })); } catch (e) {}
  }

  var fakeMap = new WeakMap();
  function makeNative(fn, orig) {
    try {
      wmSet.call(fakeMap, fn, orig);
      defProp(fn, "name", { value: orig.name, configurable: true });
      defProp(fn, "length", { value: orig.length, configurable: true });
    } catch (e) {}
    return fn;
  }
  var patchedToString = makeNative(function toString() {
    if (typeof this === "function" && wmHas.call(fakeMap, this)) return nativeToString.call(wmGet.call(fakeMap, this));
    return nativeToString.call(this);
  }, nativeToString);

  var patches = {};
  function reg(group, obj, name, orig, repl) {
    (patches[group] || (patches[group] = [])).push({ obj: obj, name: name, orig: orig, repl: repl, on: false, stuck: false });
  }
  function hookMethod(group, obj, name, factory) {
    if (!obj) return;
    var d = gOPD(obj, name);
    if (!d || typeof d.value !== "function" || !d.configurable) return;
    var w = makeNative(factory(d.value), d.value);
    reg(group, obj, name, d, { value: w, writable: d.writable, enumerable: d.enumerable, configurable: true });
  }
  function hookGetter(group, obj, name, spoof) {
    if (!obj) return;
    var d = gOPD(obj, name);
    if (!d || !d.get || !d.configurable) return;
    var ng = d.get;
    var g = makeNative(function () {
      var v = ng.call(this);
      return wanted(group) ? spoof.call(this, v) : v;
    }, ng);
    reg(group, obj, name, d, { get: g, set: d.set, enumerable: d.enumerable, configurable: true });
  }
  function applyPatch(p) {
    if (p.on) return;
    if (p.stuck) { p.on = true; p.stuck = false; return; }
    try { defProp(p.obj, p.name, p.repl); p.on = true; } catch (e) {}
  }
  function removePatch(p) {
    if (!p.on) return;
    try {
      var cur = gOPD(p.obj, p.name);
      var ours = cur && ("value" in p.repl ? cur.value === p.repl.value : cur.get === p.repl.get);
      if (ours) defProp(p.obj, p.name, p.orig); else p.stuck = true;
    } catch (e) { p.stuck = true; }
    p.on = false;
  }
  function wanted(g) {
    if (g === "intl") return cfg.active && (!!cfg.groups.locale || !!cfg.groups.timezone);
    if (g === "privq") return cfg.active && (!!cfg.groups.stealth || !!cfg.groups.geo);
    if (g === "langq") return cfg.active && (!!cfg.groups.locale || !!cfg.groups.stealth);
    if (g === "beaconq") return cfg.active && (!!cfg.groups.beacon || !!cfg.groups.analytics);
    return grp(g);
  }

  var busy = false;
  function sync() {
    if (busy) return;
    busy = true;
    try {
      var order = GROUPS.concat(["intl", "privq", "langq", "beaconq"]), anyStuck = false, i, j, list;
      if (cfg.active) (patches.core || []).forEach(applyPatch);
      if (wanted("analytics")) installStubs();
      for (i = 0; i < order.length; i++) {
        list = patches[order[i]] || [];
        for (j = 0; j < list.length; j++) {
          if (wanted(order[i])) applyPatch(list[j]); else removePatch(list[j]);
          if (list[j].stuck) anyStuck = true;
        }
      }
      if (!cfg.active && !anyStuck) (patches.core || []).forEach(removePatch);
    } finally { busy = false; }
  }

  addEL.call(window, EV_CFG, function (e) {
    var d;
    try { d = jsonParse(String(e.detail)); } catch (err) { return; }
    if (!d || typeof d !== "object") return;
    cfg = { active: !!d.active, groups: d.groups || {}, mode: d.mode || "stable", legend: null };
    var lg = (cfg.mode === "stable" && d.legend && d.legend.id) ? d.legend : null;
    var id = lg ? lg.id : null;
    if (id !== ST.legendId || cfg.mode !== ST.mode) {
      ST = derive(lg);
    }
    sync();
  });

  // CORE — Function.prototype.toString masking
  (function () {
    var d = gOPD(Function.prototype, "toString");
    if (d) reg("core", Function.prototype, "toString", d, { value: patchedToString, writable: true, enumerable: false, configurable: true });
  })();

  // CANVAS — noise on a copy, seeded by the legend (stable) or per-visit
  (function () {
    if (typeof HTMLCanvasElement === "undefined" || typeof CanvasRenderingContext2D === "undefined") return;
    var C2D = CanvasRenderingContext2D.prototype;
    var oGID = C2D.getImageData, oPID = C2D.putImageData, oDraw = C2D.drawImage;
    var oGetCtx = HTMLCanvasElement.prototype.getContext, createEl = Document.prototype.createElement;

    function perturb(data) {
      var px = data.length >> 2;
      if (!px) return;
      var count = mMax(10, mFloor(px * 0.01));
      if (count > 40000) count = 40000;
      for (var i = 0; i < count; i++) {
        var p = mFloor(hash(i * 3 + 1 + px) * px) * 4;
        if (data[p + 3] === 0) continue;
        var ch = p + mFloor(hash(i * 3 + 2) * 3), dlt = hash(i * 3 + 3) < 0.5 ? -1 : 1;
        var v = data[ch] + dlt;
        data[ch] = v < 0 || v > 255 ? data[ch] - dlt : v;
      }
    }
    function noisyCopy(src) {
      var w = src.width, h = src.height;
      if (!w || !h || w * h > 4000000) return null;
      var c = createEl.call(document, "canvas");
      c.width = w; c.height = h;
      var ctx = oGetCtx.call(c, "2d");
      if (!ctx) return null;
      oDraw.call(ctx, src, 0, 0);
      var img = oGID.call(ctx, 0, 0, w, h);
      perturb(img.data);
      oPID.call(ctx, img, 0, 0);
      return c;
    }
    function exportHook(orig) {
      return function () {
        if (grp("canvas")) {
          var c = null;
          try { c = noisyCopy(this); } catch (e) {}
          if (c) { trigger("canvas"); return orig.apply(c, arguments); }
        }
        return orig.apply(this, arguments);
      };
    }
    hookMethod("canvas", HTMLCanvasElement.prototype, "toDataURL", exportHook);
    hookMethod("canvas", HTMLCanvasElement.prototype, "toBlob", exportHook);
    hookMethod("canvas", C2D, "getImageData", function (orig) {
      return function () {
        var img = orig.apply(this, arguments);
        if (grp("canvas")) { try { perturb(img.data); trigger("canvas"); } catch (e) {} }
        return img;
      };
    });

    if (typeof OffscreenCanvas !== "undefined") {
      var OC = OffscreenCanvas, oOcCtx = OC.prototype.getContext;
      var OC2D = typeof OffscreenCanvasRenderingContext2D !== "undefined" ? OffscreenCanvasRenderingContext2D.prototype : null;
      if (OC2D) {
        var ooGID = OC2D.getImageData, ooPID = OC2D.putImageData, ooDraw = OC2D.drawImage;
        hookMethod("canvas", OC.prototype, "convertToBlob", function (orig) {
          return function () {
            if (grp("canvas")) {
              try {
                var w = this.width, h = this.height;
                if (w && h && w * h <= 4000000) {
                  var copy = new OC(w, h), ctx = oOcCtx.call(copy, "2d");
                  ooDraw.call(ctx, this, 0, 0);
                  var img = ooGID.call(ctx, 0, 0, w, h);
                  perturb(img.data); ooPID.call(ctx, img, 0, 0);
                  trigger("canvas");
                  return orig.apply(copy, arguments);
                }
              } catch (e) {}
            }
            return orig.apply(this, arguments);
          };
        });
        hookMethod("canvas", OC2D, "getImageData", function (orig) {
          return function () {
            var img = orig.apply(this, arguments);
            if (grp("canvas")) { try { perturb(img.data); trigger("canvas"); } catch (e) {} }
            return img;
          };
        });
      }
    }
  })();

  // WEBGL — legend vendor/renderer (UNMASKED_* 37445/37446), readPixels noise, debug-ext fallback
  (function () {
    function patch(proto) {
      if (!proto) return;
      hookMethod("webgl", proto, "getParameter", function (orig) {
        return function (p) {
          if (grp("webgl")) {
            if (p === 37445) { trigger("webgl"); return ST.gpuV; }
            if (p === 37446) { trigger("webgl"); return ST.gpuR; }
          }
          return orig.apply(this, arguments);
        };
      });
      hookMethod("webgl", proto, "getExtension", function (orig) {
        return function (name) {
          var ext = orig.apply(this, arguments);
          if (grp("webgl") && !ext && String(name).toLowerCase() === "webgl_debug_renderer_info") {
            try {
              var fake = { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
              try { defProp(fake, Symbol.toStringTag, { value: "WebGLDebugRendererInfo", configurable: true }); } catch (e) {}
              return fake;
            } catch (e) {}
          }
          return ext;
        };
      });
      hookMethod("webgl", proto, "readPixels", function (orig) {
        return function () {
          var res = orig.apply(this, arguments);
          if (grp("webgl")) {
            try {
              var px = arguments[6];
              if (px && px.length) {
                for (var i = 0; i < px.length; i += 97) if (hash(i + 7) < 0.5) px[i] = px[i] ^ 1;
                trigger("webgl");
              }
            } catch (e) {}
          }
          return res;
        };
      });
    }
    if (typeof WebGLRenderingContext !== "undefined") patch(WebGLRenderingContext.prototype);
    if (typeof WebGL2RenderingContext !== "undefined") patch(WebGL2RenderingContext.prototype);
  })();

  // AUDIO — per-load buffer noise + legend sampleRate
  (function () {
    if (typeof AudioBuffer !== "undefined") {
      var AB = AudioBuffer.prototype, oGetCh = AB.getChannelData, noised = new WeakMap();
      function noiseChannel(buf, ch) {
        var data = oGetCh.call(buf, ch);
        var marks = wmGet.call(noised, buf) || {};
        if (!marks[ch]) {
          for (var i = 0; i < data.length; i += 100) data[i] += (hash(i + ch * 7919) * 2 - 1) * 1e-7;
          marks[ch] = 1;
          wmSet.call(noised, buf, marks);
        }
        return data;
      }
      hookMethod("audio", AB, "getChannelData", function (orig) {
        return function (ch) {
          if (!grp("audio")) return orig.apply(this, arguments);
          try { var d = noiseChannel(this, ch); trigger("audio"); return d; } catch (e) { return orig.apply(this, arguments); }
        };
      });
      hookMethod("audio", AB, "copyFromChannel", function (orig) {
        return function (dest, ch) {
          if (grp("audio")) { try { noiseChannel(this, ch); trigger("audio"); } catch (e) {} }
          return orig.apply(this, arguments);
        };
      });
      if (typeof AnalyserNode !== "undefined") {
        hookMethod("audio", AnalyserNode.prototype, "getFloatFrequencyData", function (orig) {
          return function (arr) {
            var r = orig.apply(this, arguments);
            if (grp("audio")) { try { for (var i = 0; i < arr.length; i += 50) arr[i] += (hash(i + 31) * 2 - 1) * 1e-4; trigger("audio"); } catch (e) {} }
            return r;
          };
        });
        hookMethod("audio", AnalyserNode.prototype, "getByteFrequencyData", function (orig) {
          return function (arr) {
            var r = orig.apply(this, arguments);
            if (grp("audio")) { try { for (var i = 0; i < arr.length; i += 50) if (hash(i + 37) < 0.5) arr[i] = arr[i] ^ 1; trigger("audio"); } catch (e) {} }
            return r;
          };
        });
      }
    }
    var BAC = typeof BaseAudioContext !== "undefined" ? BaseAudioContext.prototype : null;
    if (BAC) {
      hookGetter("audio", BAC, "sampleRate", function () { return ST.sampleRate; });
    } else {
      if (typeof AudioContext !== "undefined") hookGetter("audio", AudioContext.prototype, "sampleRate", function () { return ST.sampleRate; });
      if (typeof OfflineAudioContext !== "undefined") hookGetter("audio", OfflineAudioContext.prototype, "sampleRate", function () { return ST.sampleRate; });
    }
  })();

  // CLIENT RECTS — real DOMRect objects with a legend-seeded scale
  (function () {
    if (typeof DOMRect === "undefined" || typeof Element === "undefined") return;
    var DR = DOMRect;
    function noiseRect(r) { return new DR(r.x + ST.rectEx, r.y + ST.rectEy, r.width * (1 + ST.rectEs), r.height * (1 + ST.rectEs)); }
    function rectHook(orig) {
      return function () {
        var r = orig.apply(this, arguments);
        if (!grp("rects")) return r;
        try { trigger("rects"); return noiseRect(r); } catch (e) { return r; }
      };
    }
    hookMethod("rects", Element.prototype, "getBoundingClientRect", rectHook);
    if (typeof Range !== "undefined") hookMethod("rects", Range.prototype, "getBoundingClientRect", rectHook);
    function listHook(orig) {
      return function () {
        var list = orig.apply(this, arguments);
        if (!grp("rects")) return list;
        try {
          trigger("rects");
          return new PX(list, {
            get: function (t, k) {
              if (k === "item") return function (n) { var r = t.item(n); return r ? noiseRect(r) : r; };
              if (typeof k === "string" && /^\d+$/.test(k)) { var r = t[k]; return r ? noiseRect(r) : r; }
              if (k === Symbol.iterator) return function* () { for (var i = 0; i < t.length; i++) yield noiseRect(t[i]); };
              var v = t[k];
              return typeof v === "function" ? v.bind(t) : v;
            }
          });
        } catch (e) { return list; }
      };
    }
    hookMethod("rects", Element.prototype, "getClientRects", listHook);
    if (typeof Range !== "undefined") hookMethod("rects", Range.prototype, "getClientRects", listHook);
  })();

  // FONTS — metrics scale + document.fonts.check() admits only the legend's font set
  (function () {
    if (typeof CanvasRenderingContext2D !== "undefined") {
      hookMethod("fonts", CanvasRenderingContext2D.prototype, "measureText", function (orig) {
        return function () {
          var m = orig.apply(this, arguments);
          if (!grp("fonts")) return m;
          try {
            trigger("fonts");
            var k = ST.fontK;
            return new PX(m, { get: function (t, key) { if (key === "width") return t.width * k; var v = t[key]; return typeof v === "function" ? v.bind(t) : v; } });
          } catch (e) { return m; }
        };
      });
    }
    var GENERIC = { serif: 1, "sans-serif": 1, monospace: 1, cursive: 1, fantasy: 1, "system-ui": 1, "ui-serif": 1, "ui-sans-serif": 1, "ui-monospace": 1, "ui-rounded": 1, emoji: 1, math: 1, fangsong: 1 };
    function familiesIn(spec) {
      var out = [];
      String(spec || "").split(",").forEach(function (part) {
        var q = part.match(/"([^"]+)"|'([^']+)'/);
        var name;
        if (q) name = q[1] || q[2];
        else {
          name = part.replace(/^\s*(italic|oblique|small-caps|bold(?:er)?|lighter|\d+(?:\.\d+)?(?:px|pt|pc|em|rem|ex|ch|vw|vh|vmin|vmax|%|xx-small|x-small|small|medium|large|x-large|xx-large|larger|smaller|condensed|expanded|[\d\/\s\.]+))+\s+/i, "").trim();
        }
        if (name) out.push(name.toLowerCase());
      });
      return out;
    }
    if (typeof FontFaceSet !== "undefined") {
      hookMethod("fonts", FontFaceSet.prototype, "check", function (orig) {
        return function (font) {
          if (!grp("fonts")) return orig.apply(this, arguments);
          try {
            var fams = familiesIn(font), set = {};
            ST.fonts.forEach(function (f) { set[String(f).toLowerCase()] = 1; });
            for (var i = 0; i < fams.length; i++) {
              if (GENERIC[fams[i]]) continue;
              if (!set[fams[i]]) return false;
            }
            trigger("fonts");
          } catch (e) {}
          return orig.apply(this, arguments);
        };
      });
    }
  })();

  // NAVIGATOR — full legend identity (UA, platform, CPU, RAM, touch)
  var NP = typeof Navigator !== "undefined" ? Navigator.prototype : null;
  (function () {
    if (!NP) return;
    hookGetter("navigator", NP, "hardwareConcurrency", function () { trigger("navigator"); return ST.hc; });
    hookGetter("navigator", NP, "deviceMemory", function () { return ST.dm; });
    hookGetter("navigator", NP, "userAgent", function (v) { trigger("navigator"); return ST.ua || v; });
    hookGetter("navigator", NP, "appVersion", function (v) { return ST.appVer || v; });
    hookGetter("navigator", NP, "platform", function (v) { return ST.platform || v; });
    hookGetter("navigator", NP, "vendor", function () { return "Google Inc."; });
    hookGetter("navigator", NP, "maxTouchPoints", function () { return ST.touch; });
  })();

  // UA-CH — NavigatorUAData faked from the legend; high-entropy values aligned
  (function () {
    if (!NP) return;
    var cache = null;
    function uaData() {
      if (cache) return cache;
      var o = {
        brands: ST.brands ? ST.brands.map(function (b) { return { brand: b.brand, version: b.version }; }) : [],
        mobile: ST.mobile,
        platform: ST.uaPlat,
        getHighEntropyValues: makeNative(function (hints) {
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
          try { trigger("uach"); } catch (err) {}
          return Promise.resolve(vals);
        }, Promise.resolve),
        toJSON: function () { return { brands: o.brands, mobile: o.mobile, platform: o.platform }; }
      };
      try { defProp(o, Symbol.toStringTag, { value: "NavigatorUAData", configurable: true }); } catch (e) {}
      cache = o;
      return o;
    }
    hookGetter("uach", NP, "userAgentData", function (v) {
      if (!ST.brands) return v;
      trigger("uach");
      return uaData();
    });
    if (typeof NavigatorUAData !== "undefined") {
      hookMethod("uach", NavigatorUAData.prototype, "getHighEntropyValues", function (orig) {
        return function (hints) {
          if (!grp("uach") || !ST.brands) return orig.apply(this, arguments);
          return uaData().getHighEntropyValues(hints);
        };
      });
    }
  })();

  // LOCALE + TIMEZONE shared Intl layer (group "intl": locale || timezone)
  var explicitLoc = new WeakSet(), explicitTZ = new WeakSet();
  (function () {
    if (!NP) return;
    hookGetter("locale", NP, "language", function () { return ST.locale; });
    // Single languages hook (locale wins, stealth only backfills empties): avoids two wrappers on one property.
    hookGetter("langq", NP, "languages", function (v) {
      if (grp("locale")) { trigger("locale"); return Object.freeze(ST.langs.slice()); }
      if (v && v.length) return v;
      trigger("stealth");
      return Object.freeze([ST.locale, ST.locale.split("-")[0]]);
    });
    hookGetter("locale", NP, "vendorSub", function () { return ""; });
    hookGetter("locale", NP, "productSub", function () { return "20030107"; });
    hookGetter("locale", NP, "product", function () { return "Gecko"; });
    hookGetter("locale", NP, "oscpu", function () {
      if (ST.os === "win") return "Windows NT 10.0; Win64; x64";
      if (ST.os === "mac") return "Intel Mac OS X 10.15";
      return "Linux x86_64";
    });
    try {
      if (typeof MimeTypeArray !== "undefined" && NP.mimeTypes) {
        hookGetter("locale", NP, "mimeTypes", function (v) { return v; });
      }
    } catch (e) {}
  })();
  (function () {
    if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return;
    hookMethod("intl", Intl, "DateTimeFormat", function (Ctor) {
      var W = function DateTimeFormat() {
        var a = slice.call(arguments), o = a[1];
        if (o === undefined || o === null) { o = {}; a[1] = o; }
        else if (typeof o === "object") o = Object.assign({}, o);
        else o = {};
        a[1] = o;
        var inst;
        try {
          var loc = a[0], hadLoc = typeof loc !== "undefined";
          var hadTZ = !!(o && typeof o === "object" && "timeZone" in o);
          if (grp("locale") && !hadLoc) a[0] = ST.locale;
          if (grp("timezone") && !hadTZ) a[1] = Object.assign({}, o, { timeZone: ST.tzName });
          inst = RConstruct(Ctor, a);
          if (hadLoc) { try { explicitLoc.add(inst); } catch (e) {} }
          if (hadTZ) { try { explicitTZ.add(inst); } catch (e) {} }
        } catch (e) { return RConstruct(Ctor, arguments); }
        return inst;
      };
      W.prototype = Ctor.prototype;
      try { defProp(W, "name", { value: "DateTimeFormat", configurable: true }); } catch (e) {}
      return W;
    });
    if (Intl.NumberFormat) {
      hookMethod("intl", Intl, "NumberFormat", function (Ctor) {
        var W = function NumberFormat() {
          var a = slice.call(arguments);
          try {
            if (grp("locale") && typeof a[0] === "undefined") a[0] = ST.locale;
            var inst = RConstruct(Ctor, a);
            if (typeof arguments[0] !== "undefined") { try { explicitLoc.add(inst); } catch (e) {} }
            return inst;
          } catch (e) { return RConstruct(Ctor, arguments); }
        };
        W.prototype = Ctor.prototype;
        try { defProp(W, "name", { value: "NumberFormat", configurable: true }); } catch (e) {}
        return W;
      });
    }
    function localeFix(orig) {
      return function () {
        var o = orig.apply(this, arguments);
        try {
          if (grp("locale") && o && !wmHas.call(explicitLoc, this) && o.locale !== ST.locale) o.locale = ST.locale;
          if (grp("timezone") && o && !wmHas.call(explicitTZ, this) && ST.tzName && o.timeZone !== ST.tzName) o.timeZone = ST.tzName;
        } catch (e) {}
        return o;
      };
    }
    hookMethod("intl", Intl.DateTimeFormat.prototype, "resolvedOptions", localeFix);
    if (Intl.NumberFormat) hookMethod("intl", Intl.NumberFormat.prototype, "resolvedOptions", localeFix);
  })();

  // TIMEZONE — DST-aware offsets, zone-consistent Date getters and strings
  function nthWeekday(y, m, wd, n) {
    var dow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    return 1 + ((wd - dow + 7) % 7) + (n - 1) * 7;
  }
  function lastWeekday(y, m, wd) {
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var dow = new Date(Date.UTC(y, m, last)).getUTCDay();
    return last - ((dow - wd + 7) % 7);
  }
  function tzOffset(d) {
    var S = ST.tzStd, rule = ST.tzRule || "none";
    if (rule === "none") return S;
    var t;
    try { t = d.getTime(); } catch (e) { return S; }
    if (rule === "us") {
      var y = new Date(t).getUTCFullYear();
      var s = Date.UTC(y, 2, nthWeekday(y, 2, 0, 2), 2, 0) + S * 60000;
      var e2 = Date.UTC(y, 10, nthWeekday(y, 10, 0, 1), 2, 0) + (S - 60) * 60000;
      return (t >= s && t < e2) ? S - 60 : S;
    }
    if (rule === "eu") {
      var y2 = new Date(t).getUTCFullYear();
      var s2 = Date.UTC(y2, 2, lastWeekday(y2, 2, 0), 1, 0);
      var e3 = Date.UTC(y2, 9, lastWeekday(y2, 9, 0), 1, 0);
      return (t >= s2 && t < e3) ? S - 60 : S;
    }
    if (rule === "au") {
      var dt = new Date(t), y3 = dt.getUTCFullYear();
      var s3 = Date.UTC(y3, 9, nthWeekday(y3, 9, 0, 1), 2, 0) + S * 60000;
      var e4 = Date.UTC(y3, 3, nthWeekday(y3, 3, 0, 1), 3, 0) + (S - 60) * 60000;
      return (t >= s3 || t < e4) ? S - 60 : S;
    }
    return S;
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function tzLongName(d) {
    try {
      var parts = new Intl.DateTimeFormat("en-US", { timeZone: ST.tzName, timeZoneName: "long" }).formatToParts(d);
      for (var i = 0; i < parts.length; i++) if (parts[i].type === "timeZoneName") return parts[i].value;
    } catch (e) {}
    return "";
  }
  function dParts(d) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ST.tzName, weekday: "short", year: "numeric", month: "numeric",
      day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: false
    }).formatToParts(d);
    var m = {};
    for (var i = 0; i < parts.length; i++) m[parts[i].type] = parts[i].value;
    var wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[m.weekday];
    var hr = parseInt(m.hour, 10);
    if (hr === 24) hr = 0;
    return { y: parseInt(m.year, 10), mo: parseInt(m.month, 10) - 1, d: parseInt(m.day, 10), wd: wd, h: hr, mi: parseInt(m.minute, 10), s: parseInt(m.second, 10) };
  }
  (function () {
    if (typeof Date === "undefined" || !Date.prototype) return;
    var DP = Date.prototype;
    hookMethod("timezone", DP, "getTimezoneOffset", function (orig) {
      return function () {
        if (!grp("timezone")) return orig.apply(this, arguments);
        trigger("timezone");
        try { return tzOffset(this); } catch (e) { return orig.apply(this, arguments); }
      };
    });
    function getterHook(name, pick) {
      hookMethod("timezone", DP, name, function (orig) {
        return function () {
          if (!grp("timezone")) return orig.apply(this, arguments);
          try { return pick(dParts(this)); } catch (e) { return orig.apply(this, arguments); }
        };
      });
    }
    getterHook("getFullYear", function (p) { return p.y; });
    getterHook("getMonth", function (p) { return p.mo; });
    getterHook("getDate", function (p) { return p.d; });
    getterHook("getDay", function (p) { return p.wd; });
    getterHook("getHours", function (p) { return p.h; });
    getterHook("getMinutes", function (p) { return p.mi; });
    getterHook("getSeconds", function (p) { return p.s; });
    getterHook("getYear", function (p) { return p.y - 1900; });
    function strHook(orig) {
      return function () {
        if (!grp("timezone") || !ST.tzName) return orig.apply(this, arguments);
        try {
          var d = this, off = tzOffset(d), s = orig.apply(d, arguments);
          var a = mAbs(off), gmt = "GMT" + (off <= 0 ? "+" : "-") + pad2(mFloor(a / 60)) + pad2(a % 60);
          s = String(s).replace(/GMT[+-]\d{4}/, gmt);
          var lz = tzLongName(d);
          if (lz) s = s.replace(/\s\(.*\)$/, " (" + lz + ")");
          trigger("timezone");
          return s;
        } catch (e) { return orig.apply(this, arguments); }
      };
    }
    hookMethod("timezone", DP, "toString", strHook);
    hookMethod("timezone", DP, "toTimeString", strHook);
    function locHook(orig) {
      return function () {
        if (!grp("timezone") && !grp("locale")) return orig.apply(this, arguments);
        try {
          var a = slice.call(arguments);
          if (grp("locale") && typeof a[0] === "undefined") a[0] = ST.locale;
          if (grp("timezone")) {
            var o = a[1];
            if (o === undefined || o === null) a[1] = { timeZone: ST.tzName };
            else if (typeof o === "object" && !("timeZone" in o)) { o = Object.assign({}, o); o.timeZone = ST.tzName; a[1] = o; }
          }
          return orig.apply(this, a);
        } catch (e) { return orig.apply(this, arguments); }
      };
    }
    hookMethod("timezone", DP, "toLocaleString", locHook);
    hookMethod("timezone", DP, "toLocaleDateString", locHook);
    hookMethod("timezone", DP, "toLocaleTimeString", locHook);
  })();

  // GEO — legend coordinates with GPS-like micro-jitter (OFF by default: needs matching IP)
  var geoSeq = 0;
  function fakePosition() {
    var i = geoSeq++;
    var j = function (s) { return (hash(9000 + i * 4 + s) - 0.5); };
    var pos = {
      coords: {
        latitude: ST.lat + j(1) * 0.0009,
        longitude: ST.lon + j(2) * 0.0009,
        accuracy: ST.acc + mFloor(j(3) * 8),
        altitude: null, altitudeAccuracy: null, heading: null, speed: null
      },
      timestamp: Date.now()
    };
    pos.toJSON = function () {
      return { coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: pos.timestamp };
    };
    return pos;
  }
  (function () {
    var GP = null;
    try { GP = navigator.geolocation ? Object.getPrototypeOf(navigator.geolocation) : null; } catch (e) {}
    if (!GP && typeof Geolocation !== "undefined") { try { GP = Geolocation.prototype; } catch (e) {} }
    if (!GP) return;
    hookMethod("geo", GP, "getCurrentPosition", function (orig) {
      return function (ok, err) {
        if (!grp("geo") || ST.lat === null || ST.lat === undefined) return orig.apply(this, arguments);
        trigger("geo");
        var self = this, args = arguments;
        if (typeof ok === "function") setTimeout(function () { try { ok.call(self, fakePosition()); } catch (e) { try { err && err.call(self, e); } catch (x) {} } }, 0);
        else if (typeof err === "function") setTimeout(function () { try { err.call(self, { code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1 }); } catch (e) {} }, 0);
      };
    });
    hookMethod("geo", GP, "watchPosition", function (orig) {
      return function (ok) {
        if (!grp("geo") || ST.lat === null || ST.lat === undefined) return orig.apply(this, arguments);
        trigger("geo");
        var self = this, id = 1000 + (geoSeq++);
        if (typeof ok === "function") setTimeout(function () { try { ok.call(self, fakePosition()); } catch (e) {} }, 0);
        return id;
      };
    });
    hookMethod("geo", GP, "clearWatch", function (orig) {
      return function () {
        if (grp("geo")) return;
        return orig.apply(this, arguments);
      };
    });
  })();

  // SCREEN — legend resolution, depth, DPR, orientation
  (function () {
    var SP = typeof Screen !== "undefined" ? Screen.prototype : null;
    if (!SP) return;
    hookGetter("screen", SP, "width", function () { trigger("screen"); return ST.scrW; });
    hookGetter("screen", SP, "height", function () { return ST.scrH; });
    hookGetter("screen", SP, "availWidth", function () { return ST.scrW; });
    hookGetter("screen", SP, "availHeight", function () { return ST.scrH - ST.bar; });
    hookGetter("screen", SP, "availLeft", function () { return 0; });
    hookGetter("screen", SP, "availTop", function () { return 0; });
    hookGetter("screen", SP, "colorDepth", function () { return ST.depth; });
    hookGetter("screen", SP, "pixelDepth", function () { return ST.depth; });
    try {
      if (typeof ScreenOrientation !== "undefined" && ScreenOrientation.prototype) {
        var land = ST.scrW >= ST.scrH;
        hookGetter("screen", ScreenOrientation.prototype, "type", function () { return land ? "landscape-primary" : "portrait-primary"; });
        hookGetter("screen", ScreenOrientation.prototype, "angle", function () { return 0; });
      }
    } catch (e) {}
    try {
      hookGetter("screen", window, "devicePixelRatio", function () { return ST.dpr; });
    } catch (e) {}
    try {
      if (typeof Window !== "undefined" && Window.prototype) hookGetter("screen", Window.prototype, "devicePixelRatio", function () { return ST.dpr; });
    } catch (e) {}
  })();

  // WEBRTC — no STUN, raw-IP ICE candidates dropped (mDNS .local only)
  (function () {
    function leaks(ev) {
      try {
        var c = ev && ev.candidate;
        if (!c) return false;
        var a = c.address || String(c.candidate || "").split(" ")[4] || "";
        return !!a && !/\.local$/i.test(a);
      } catch (e) { return false; }
    }
    function wrapCtor(name) {
      hookMethod("webrtc", window, name, function (Ctor) {
        var W = function RTCPeerConnection(conf) {
          if (!grp("webrtc")) return RConstruct(Ctor, arguments);
          try { conf = Object.assign({}, conf || {}, { iceServers: [] }); } catch (e) { conf = { iceServers: [] }; }
          var pc = new Ctor(conf), oAdd = pc.addEventListener;
          try {
            defProp(pc, "addEventListener", { configurable: true, writable: true, value: makeNative(function (type, listener, opts) {
              if (type === "icecandidate" && typeof listener === "function") {
                return oAdd.call(this, type, function (ev) { if (leaks(ev)) return; return listener.apply(this, arguments); }, opts);
              }
              return oAdd.apply(this, arguments);
            }, oAdd) });
            var hd = gOPD(Ctor.prototype, "onicecandidate");
            if (hd && hd.set) {
              defProp(pc, "onicecandidate", { configurable: true, get: function () { return hd.get.call(this); }, set: function (fn) {
                hd.set.call(this, typeof fn === "function" ? function (ev) { if (leaks(ev)) return; return fn.apply(this, arguments); } : fn);
              } });
            }
          } catch (e) {}
          trigger("webrtc");
          return pc;
        };
        W.prototype = Ctor.prototype;
        return W;
      });
    }
    if (window.RTCPeerConnection) wrapCtor("RTCPeerConnection");
    if (window.webkitRTCPeerConnection && window.webkitRTCPeerConnection !== window.RTCPeerConnection) wrapCtor("webkitRTCPeerConnection");
  })();

  // BATTERY — legend charge state instead of a suspicious rejection
  (function () {
    if (!NP) return;
    hookMethod("battery", NP, "getBattery", function (orig) {
      return function () {
        if (!grp("battery")) return orig.apply(this, arguments);
        trigger("battery");
        try {
          var b = ST.battery || { charging: true, level: 1, cTime: 0, dTime: Infinity };
          var mgr = new EventTarget();
          defProp(mgr, "charging", { configurable: true, get: function () { return b.charging; } });
          defProp(mgr, "chargingTime", { configurable: true, get: function () { return b.cTime; } });
          defProp(mgr, "dischargingTime", { configurable: true, get: function () { return b.dTime; } });
          defProp(mgr, "level", { configurable: true, get: function () { return b.level; } });
          mgr.onchargingchange = null; mgr.onchargingtimechange = null;
          mgr.ondischargingtimechange = null; mgr.onlevelchange = null;
          try { defProp(mgr, Symbol.toStringTag, { value: "BatteryManager", configurable: true }); } catch (e) {}
          return Promise.resolve(mgr);
        } catch (e) { return orig.apply(this, arguments); }
      };
    });
  })();

  // MEDIA DEVICES — one anonymous entry per kind
  if (typeof MediaDevices !== "undefined") {
    hookMethod("media", MediaDevices.prototype, "enumerateDevices", function (orig) {
      return function () {
        var p = orig.apply(this, arguments);
        if (!grp("media")) return p;
        return p.then(function (devs) {
          try {
            var seen = {}, out = [];
            devs.forEach(function (d) {
              if (seen[d.kind]) return;
              seen[d.kind] = 1;
              var o = { deviceId: "", groupId: "", kind: d.kind, label: "" };
              o.toJSON = function () { return { deviceId: "", groupId: "", kind: o.kind, label: "" }; };
              out.push(o);
            });
            if (!out.length && ST.stable) {
              ["audioinput", "audiooutput", "videoinput"].forEach(function (kind) {
                var o = { deviceId: "", groupId: "", kind: kind, label: "" };
                o.toJSON = function () { return { deviceId: "", groupId: "", kind: o.kind, label: "" }; };
                out.push(o);
              });
            }
            trigger("media");
            return out;
          } catch (e) { return devs; }
        });
      };
    });
  }

  // SENSORS
  (function () {
    var evts = { devicemotion: 1, deviceorientation: 1, deviceorientationabsolute: 1 };
    hookMethod("sensors", EventTarget.prototype, "addEventListener", function (orig) {
      return function (type) {
        if (evts[type] && grp("sensors")) { trigger("sensors"); return; }
        return orig.apply(this, arguments);
      };
    });
    ["Gyroscope", "Accelerometer", "Magnetometer", "AbsoluteOrientationSensor", "RelativeOrientationSensor", "LinearAccelerationSensor"].forEach(function (name) {
      if (!window[name]) return;
      hookMethod("sensors", window, name, function (Orig) {
        var W = function () {
          if (!grp("sensors")) return RConstruct(Orig, arguments);
          throw new DOMException("Not allowed", "NotAllowedError");
        };
        W.prototype = Orig.prototype;
        return W;
      });
    });
  })();

  // WORKERS — the same legend inside dedicated workers
  (function () {
    function workerHookInstaller(c) {
      try {
        if (c.groups.webgl && typeof self.WebGLRenderingContext !== "undefined") {
          [["WebGLRenderingContext"], ["WebGL2RenderingContext"]].forEach(function (pair) {
            var k = pair[0];
            if (typeof self[k] === "undefined") return;
            try {
              var proto = self[k].prototype, orig = proto.getParameter;
              proto.getParameter = function (p) {
                if (p === 37445) return c.gpuV;
                if (p === 37446) return c.gpuR;
                return orig.apply(this, arguments);
              };
            } catch (e) {}
          });
        }
        if (c.groups.navigator) {
          try {
            var nav = self.navigator;
            [["hardwareConcurrency", c.hc], ["deviceMemory", c.dm], ["platform", c.platform],
             ["appVersion", c.appVer], ["userAgent", c.ua], ["vendor", c.vendor],
             ["language", c.locale]].forEach(function (pair) {
              try { Object.defineProperty(nav, pair[0], { configurable: true, get: function () { return pair[1]; } }); } catch (e) {}
            });
            try { Object.defineProperty(nav, "languages", { configurable: true, get: function () { return c.langs.slice(); } }); } catch (e) {}
          } catch (e) {}
        }
        if (c.groups.uach && self.navigator && self.navigator.userAgentData) {
          try {
            var ud = self.navigator.userAgentData, origHE = ud.getHighEntropyValues;
            ud.getHighEntropyValues = function (hints) {
              var p = origHE ? origHE.apply(ud, arguments) : Promise.resolve({});
              return p.then(function (v) {
                try {
                  v = v || {};
                  if (c.brands) { v.brands = c.brands; v.fullVersionList = c.fullBrands; }
                  v.platform = c.uaPlat; v.mobile = c.mobile; v.model = c.model;
                  v.platformVersion = c.pv; v.uaFullVersion = c.chrome;
                  v.architecture = c.arch; v.bitness = c.bitness;
                } catch (e) {}
                return v;
              });
            };
          } catch (e) {}
        }
      } catch (e) {}
    }
    hookMethod("workers", window, "Worker", function (OrigWorker) {
      var W = function Worker(url, opts) {
        if (!grp("workers") || (opts && opts.type === "module")) return RConstruct(OrigWorker, arguments);
        try {
          var abs = new URL(url, location.href).href;
          var payload = jsonStringify({
            groups: { webgl: grp("webgl"), navigator: grp("navigator"), uach: grp("uach") },
            gpuV: ST.gpuV, gpuR: ST.gpuR, hc: ST.hc, dm: ST.dm, platform: ST.platform,
            appVer: ST.appVer, ua: ST.ua, vendor: "Google Inc.", locale: ST.locale, langs: ST.langs,
            brands: ST.brands, fullBrands: ST.fullBrands, uaPlat: ST.uaPlat, mobile: ST.mobile,
            model: ST.model, pv: ST.pv, chrome: ST.chrome, arch: ST.arch, bitness: ST.bitness
          });
          var src = "(" + nativeToString.call(workerHookInstaller) + ")(" + payload + ");\nimportScripts(" + jsonStringify(abs) + ");";
          return new OrigWorker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })), opts);
        } catch (e) { return RConstruct(OrigWorker, arguments); }
      };
      W.prototype = OrigWorker.prototype;
      return W;
    });
  })();

  // ANALYTICS — neutralize analytics, product-analytics & session-replay SDKs.
  // Studied from PostHog, Matomo, Umami, Plausible, OpenPanel, RudderStack, Countly,
  // OpenReplay, Highlight, Amplitude, Mixpanel, Segment, Heap, Hotjar, FullStory, LogRocket.
  // Two layers: (1) fake vendor-host / known-endpoint network calls, (2) install inert
  // SDK-global stubs so first-party-proxied SDKs record nothing either.
  var STUB = null;
  function analyticsStub() {
    if (STUB) return STUB;
    STUB = new PX(function () {}, {
      get: function (t, k) {
        if (k === "then" || k === "catch" || k === "finally") return undefined;
        if (k === Symbol.toPrimitive) return function () { return ""; };
        if (k === Symbol.toStringTag) return undefined;
        if (k === "toString" || k === "valueOf") return function () { return ""; };
        if (k === "length") return 0;
        return STUB;
      },
      apply: function () { return STUB; },
      construct: function () { return STUB; },
      set: function () { return true; }
    });
    return STUB;
  }
  var stubsDone = false;
  function installStubs() {
    if (stubsDone || !NP) return;
    stubsDone = true;
    var s = analyticsStub();
    function silentArray() {
      var a = [];
      try { defProp(a, "push", { value: makeNative(function () { return a.length; }, Array.prototype.push), writable: true, configurable: true }); } catch (e) {}
      return a;
    }
    function defStub(name, val) {
      try { defProp(window, name, { configurable: true, get: function () { return val; }, set: function () {} }); } catch (e) {}
    }
    // Unambiguous vendor globals only (avoid generic single letters that collide with page code).
    ["posthog", "amplitude", "mixpanel", "heap", "FS", "LogRocket", "Countly",
     "rudderanalytics", "umami", "plausible", "ga", "gtag", "hj", "_hjSettings",
     "fbq", "ym", "clarity", "snaptr", "twq", "pintrk", "Sentry", "smartlook",
     "mouseflow", "_lo", "Intercom"].forEach(function (n) { defStub(n, s); });
    ["dataLayer", "_paq", "_mtm"].forEach(function (n) { defStub(n, silentArray()); });
    try { trigger("analytics"); } catch (e) {}
  }

  (function () {
    var TRACK_HOST = /(^|\.)(posthog\.com|posthog\.io|amplitude\.com|mxpnl\.com|mixpanel\.com|segment\.(com|io)|segmentapis\.com|heapanalytics\.com|heap\.io|hotjar\.(com|io)|fullstory\.com|logrocket\.(io|com)|lr-ingest\.io|lr-in\.com|openreplay\.com|highlight\.io|clarity\.ms|mc\.yandex\.ru|plausible\.io|umami\.is|openpanel\.dev|rudderstack\.com|rudderlabs\.com|count\.ly|statsig\.com|matomo\.cloud|googletagmanager\.com|google-analytics\.com|analytics\.google\.com|sentry\.io|smartlook\.com|mouseflow\.com|inspectlet\.com|luckyorange\.com|crazyegg\.com|quantserve\.com|scorecardresearch\.com|pendo\.io)$/i;
    function isTracker(url) {
      try {
        var u = new URL(String(url), location.href), p = u.pathname, full = String(url);
        if (TRACK_HOST.test(u.hostname)) return true;
        if (/\/matomo\.php$|\/piwik\.php$/i.test(p)) return true;
        // PostHog / generic ingest paths only when a vendor hint is also present (avoids false positives).
        if (/\/(e|s|i\/v0\/e|batch|capture|decide|flags|array)(\/|\?|$)/i.test(p) && /posthog|ph_|__ph/i.test(full)) return true;
        return false;
      } catch (e) { return false; }
    }
    function fakeBody(url) {
      if (/decide|flags/i.test(String(url))) {
        return jsonStringify({
          config: { enable_collect_everything: false }, featureFlags: {}, featureFlagPayloads: {},
          errorsWhileComputingFlags: false, toolbarParams: {}, isAuthenticated: false, sessionRecording: false,
          supportedCompression: [], capturePerformance: false, autocapture_opt_out: true, autocaptureExceptions: false, siteApps: []
        });
      }
      return "";
    }

    hookMethod("analytics", window, "fetch", function (orig) {
      return function (input) {
        try {
          var url = input && input.url ? input.url : input;
          if (cfg.active && isTracker(url)) { trigger("analytics"); return Promise.resolve(new Response(fakeBody(url), { status: 200, headers: { "Content-Type": "application/json" } })); }
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    });

    if (typeof XMLHttpRequest !== "undefined") {
      var trkXhr = new WeakMap();
      hookMethod("analytics", XMLHttpRequest.prototype, "open", function (orig) {
        return function (method, url) {
          try { if (cfg.active && isTracker(url)) wmSet.call(trkXhr, this, String(url)); } catch (e) {}
          return orig.apply(this, arguments);
        };
      });
      hookMethod("analytics", XMLHttpRequest.prototype, "send", function (orig) {
        return function () {
          if (!wmHas.call(trkXhr, this)) return orig.apply(this, arguments);
          var self = this, body = fakeBody(wmGet.call(trkXhr, this));
          try {
            defProp(self, "readyState", { configurable: true, get: function () { return 4; } });
            defProp(self, "status", { configurable: true, get: function () { return 200; } });
            defProp(self, "responseText", { configurable: true, get: function () { return body; } });
            defProp(self, "response", { configurable: true, get: function () { return body; } });
          } catch (e) {}
          trigger("analytics");
          setTimeout(function () {
            ["readystatechange", "load", "loadend"].forEach(function (t) { try { self.dispatchEvent(new Event(t)); } catch (e) {} });
          }, 0);
        };
      });
    }

    hookMethod("beaconq", NP, "sendBeacon", function (orig) {
      return function (url) {
        if (grp("beacon")) { trigger("beacon"); return true; }
        if (wanted("analytics") && isTracker(url)) { trigger("analytics"); return true; }
        return orig.apply(this, arguments);
      };
    });
  })();

  // STEALTH — webdriver=false (languages are owned by the combined langq hook above)
  (function () {
    if (NP) {
      hookGetter("stealth", NP, "webdriver", function () { trigger("stealth"); return false; });
    }
  })();

  // PERMISSIONS combined query (stealth notifications + geo geolocation)
  (function () {
    try {
      if (typeof Permissions !== "undefined" && Permissions.prototype) {
        hookMethod("privq", Permissions.prototype, "query", function (orig) {
          return function (desc) {
            try {
              if (desc && desc.name === "notifications" && grp("stealth") && typeof Notification !== "undefined") {
                trigger("stealth");
                var st = Notification.permission === "default" ? "prompt" : Notification.permission;
                return Promise.resolve({ state: st, onchange: null, name: "notifications" });
              }
              if (desc && desc.name === "geolocation" && grp("geo") && ST.lat !== null && ST.lat !== undefined) {
                trigger("geo");
                return Promise.resolve({ state: "granted", onchange: null, name: "geolocation" });
              }
            } catch (e) {}
            return orig.apply(this, arguments);
          };
        });
      }
    } catch (e) {}
  })();

  sync();
})();
