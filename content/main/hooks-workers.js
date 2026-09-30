// MAIN world: WORKERS — carry the legend into workers, otherwise classic/module
// workers, SharedWorker and OffscreenCanvas-in-worker all leak the REAL machine
// (UA, cores, memory, GPU, canvas) — an instant unmasking and a rock-stable id.
//
// The installer below is serialized via Function.prototype.toString and prepended to the
// worker source, so it must stay fully self-contained (no references to this file's
// scope). All shared knowledge travels in the JSON payload: identity fields plus the
// pre-baked GL parameter/extension tables (no duplicated GL switch inside the worker).
//
// HARD LIMITATION: ServiceWorker cannot be covered from a content script — registration
// of blob:/data: scripts is forbidden. See LIMITATIONS.md.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  function workerHookInstaller(c) {
    try {
      var defP = Object.defineProperty;
      function h(n) {
        var x = ((c.seed >>> 0) ^ Math.imul(n | 0, 0x9E3779B1)) >>> 0;
        x = Math.imul(x ^ (x >>> 16), 0x85EBCA6B); x = Math.imul(x ^ (x >>> 13), 0xC2B2AE35);
        return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
      }
      function perturb(data) {
        var px = data.length >> 2; if (!px) return;
        var count = Math.max(10, Math.floor(px * 0.01)); if (count > 40000) count = 40000;
        for (var i = 0; i < count; i++) {
          var p = Math.floor(h(i * 3 + 1 + px) * px) * 4;
          if (data[p + 3] === 0) continue;
          var ch = p + Math.floor(h(i * 3 + 2) * 3), dlt = h(i * 3 + 3) < 0.5 ? -1 : 1;
          var v = data[ch] + dlt; data[ch] = (v < 0 || v > 255) ? data[ch] - dlt : v;
        }
      }
      if (c.groups.webgl) {
        [["WebGLRenderingContext", "gl1"], ["WebGL2RenderingContext", "gl2"]].forEach(function (pair) {
          var k = pair[0], tbl = c[pair[1]];
          if (typeof self[k] === "undefined" || !tbl) return;
          try {
            var proto = self[k].prototype, oGP = proto.getParameter, oGE = proto.getSupportedExtensions;
            proto.getParameter = function (p) {
              var e = tbl[p];
              if (e) {
                if (e.i) return new Int32Array(e.i);
                if (e.f) return new Float32Array(e.f);
                return e.v;
              }
              return oGP.apply(this, arguments);
            };
            if (oGE) proto.getSupportedExtensions = function () { return c[k === "WebGLRenderingContext" ? "glExt1" : "glExt2"].slice(); };
          } catch (e) {}
        });
      }
      if (c.groups.canvas && typeof self.OffscreenCanvasRenderingContext2D !== "undefined") {
        try {
          var OC2 = self.OffscreenCanvasRenderingContext2D.prototype, oGID = OC2.getImageData;
          OC2.getImageData = function () { var img = oGID.apply(this, arguments); try { perturb(img.data); } catch (e) {} return img; };
          if (self.OffscreenCanvas) {
            var OC = self.OffscreenCanvas, oCTB = OC.prototype.convertToBlob, oCtx = OC.prototype.getContext,
                oDraw = OC2.drawImage, oPID = OC2.putImageData;
            if (oCTB) OC.prototype.convertToBlob = function () {
              try {
                var w = this.width, hh = this.height;
                if (w && hh && w * hh <= 16000000) {
                  var copy = new OC(w, hh), ctx = oCtx.call(copy, "2d");
                  oDraw.call(ctx, this, 0, 0);
                  var img = oGID.call(ctx, 0, 0, w, hh); perturb(img.data); oPID.call(ctx, img, 0, 0);
                  return oCTB.apply(copy, arguments);
                }
              } catch (e) {}
              return oCTB.apply(this, arguments);
            };
          }
        } catch (e) {}
      }
      if (c.groups.navigator) {
        try {
          var nav = self.navigator;
          [["hardwareConcurrency", c.hc], ["deviceMemory", c.dm], ["platform", c.platform],
           ["appVersion", c.appVer], ["userAgent", c.ua], ["vendor", c.vendor],
           ["language", c.locale]].forEach(function (pair) {
            try { defP(nav, pair[0], { configurable: true, get: function () { return pair[1]; } }); } catch (e) {}
          });
          try { defP(nav, "languages", { configurable: true, get: function () { return c.langs.slice(); } }); } catch (e) {}
        } catch (e) {}
      }
      if (c.groups.connection) {
        try {
          var ni = self.navigator && self.navigator.connection;
          if (ni) [["effectiveType", "4g"], ["rtt", 50], ["downlink", 10], ["saveData", false]].forEach(function (pair) {
            try { defP(ni, pair[0], { configurable: true, get: function () { return pair[1]; } }); } catch (e) {}
          });
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
      if (c.groups.timezone && c.tz) {
        try {
          var TZ = c.tz, TZS = c.tzStd, TZR = c.tzRule || "none";
          var nthWd = function (y, m, wd, n) { var dw = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((wd - dw + 7) % 7) + (n - 1) * 7; };
          var lastWd = function (y, m, wd) { var l = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); var dw = new Date(Date.UTC(y, m, l)).getUTCDay(); return l - ((dw - wd + 7) % 7); };
          var tzOff = function (t) {
            if (TZR === "none") return TZS;
            var y = new Date(t).getUTCFullYear(), s, e;
            if (TZR === "us") { s = Date.UTC(y, 2, nthWd(y, 2, 0, 2), 2) + TZS * 60000; e = Date.UTC(y, 10, nthWd(y, 10, 0, 1), 2) + (TZS - 60) * 60000; return (t >= s && t < e) ? TZS - 60 : TZS; }
            if (TZR === "eu") { s = Date.UTC(y, 2, lastWd(y, 2, 0), 1); e = Date.UTC(y, 9, lastWd(y, 9, 0), 1); return (t >= s && t < e) ? TZS - 60 : TZS; }
            if (TZR === "au") { s = Date.UTC(y, 9, nthWd(y, 9, 0, 1), 2) + TZS * 60000; e = Date.UTC(y, 3, nthWd(y, 3, 0, 1), 3) + (TZS - 60) * 60000; return (t >= s || t < e) ? TZS - 60 : TZS; }
            return TZS;
          };
          Date.prototype.getTimezoneOffset = function () { try { return tzOff(this.getTime()); } catch (e) { return TZS; } };
          // Intl in a worker resolves the REAL host zone/locale otherwise — a realm
          // mismatch next to the spoofed window Intl (bot-signal worker consistency).
          var ODTF = Intl.DateTimeFormat;
          var WDTF = function (loc, opts) {
            var o = opts;
            if (o === undefined || o === null) o = {}; else if (typeof o === "object") o = Object.assign({}, o); else o = {};
            if (!("timeZone" in o)) o.timeZone = TZ;
            return new ODTF(loc === undefined ? c.locale : loc, o);
          };
          WDTF.prototype = ODTF.prototype;
          try { Object.defineProperty(ODTF.prototype, "constructor", { value: WDTF, writable: true, configurable: true }); } catch (e) {}
          if (ODTF.supportedLocalesOf) WDTF.supportedLocalesOf = function () { return ODTF.supportedLocalesOf.apply(ODTF, arguments); };
          Intl.DateTimeFormat = WDTF;
        } catch (e) {}
      }
    } catch (e) {}
  }

  function buildPayload() {
    var ST = M.ST;
    return M.jsonStringify({
      groups: { webgl: M.grp("webgl"), navigator: M.grp("navigator"), uach: M.grp("uach"), canvas: M.grp("canvas"), connection: M.grp("navigator"), timezone: M.grp("timezone") },
      seed: ST.seed >>> 0,
      gpuV: ST.gpuV, gpuR: ST.gpuR, hc: ST.hc, dm: ST.dm, platform: ST.platform,
      appVer: ST.appVer, ua: ST.ua, vendor: "Google Inc.", locale: ST.locale, langs: ST.langs,
      tz: ST.tzName, tzStd: ST.tzStd, tzRule: ST.tzRule,
      brands: ST.brands, fullBrands: ST.fullBrands, uaPlat: ST.uaPlat, mobile: ST.mobile,
      model: ST.model, pv: ST.pv, chrome: ST.chrome, arch: ST.arch, bitness: ST.bitness,
      glExt1: M.GL_EXT1, glExt2: M.GL_EXT2, gl1: M.glTable(false), gl2: M.glTable(true)
    });
  }

  function makeSrc(abs, isModule) {
    var head = "(" + M.nativeToString.call(workerHookInstaller) + ")(" + buildPayload() + ");\n";
    if (!isModule) return head + "importScripts(" + M.jsonStringify(abs) + ");";
    // A module worker can only be loaded with async import(); the site's message/connect
    // handler would be attached AFTER the first posted message arrives, losing it. Buffer
    // message/connect/messageerror events in the capture phase until import() resolves,
    // then replay them so the real handler still sees them.
    return head +
      "(function(){var T=['message','connect','messageerror'],B=[],D=false;" +
      "function C(e){if(!D){B.push(e);}}" +
      "T.forEach(function(t){self.addEventListener(t,C,true);});" +
      "import(" + M.jsonStringify(abs) + ").then(function(){D=true;" +
      "T.forEach(function(t){self.removeEventListener(t,C,true);});" +
      "B.forEach(function(e){try{self.dispatchEvent(new MessageEvent(e.type,{data:e.data,origin:e.origin,ports:e.ports}));}catch(_){}});" +
      "B=[];}).catch(function(e){setTimeout(function(){throw e;},0);});})();";
  }

  function blobUrl(src) { return URL.createObjectURL(new Blob([src], { type: "text/javascript" })); }

  M.hookMethod("workers", window, "Worker", function (OrigWorker) {
    var W = function Worker(url, opts) {
      if (!M.grp("workers")) return M.RConstruct(OrigWorker, arguments);
      try {
        var abs = new URL(url, location.href).href;
        var isModule = !!(opts && opts.type === "module");
        return new OrigWorker(blobUrl(makeSrc(abs, isModule)), opts);
      } catch (e) { return M.RConstruct(OrigWorker, arguments); }
    };
    W.prototype = OrigWorker.prototype;
    return W;
  });

  if (window.SharedWorker) {
    var shareCache = {};
    M.hookMethod("workers", window, "SharedWorker", function (OrigSW) {
      var W = function SharedWorker(url, opts) {
        if (!M.grp("workers")) return M.RConstruct(OrigSW, arguments);
        try {
          var abs = new URL(url, location.href).href;
          var name = (opts && typeof opts === "object" && opts.name) || (typeof opts === "string" ? opts : "");
          var isModule = !!(opts && typeof opts === "object" && opts.type === "module");
          var key = abs + "\n" + name + "\n" + (isModule ? 1 : 0) + "\n" + (M.ST.legendId || M.ST.seed);
          var burl = shareCache[key] || (shareCache[key] = blobUrl(makeSrc(abs, isModule)));
          return new OrigSW(burl, opts);
        } catch (e) { return M.RConstruct(OrigSW, arguments); }
      };
      W.prototype = OrigSW.prototype;
      return W;
    });
  }
})();
