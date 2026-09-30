// MAIN world: NAVIGATOR — full legend identity (UA, platform, CPU, RAM, touch), plus
// Network Information, storage quota and the TTS voice list (all stable, high-entropy).
//
// NOTE: navigator.oscpu is deliberately NOT spoofed — it is Gecko-only and simply does
// not exist in Chrome; returning a value there is itself a spoof signal. Same for the
// old no-op mimeTypes hook, which did nothing and was dropped.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;
  var NP = typeof Navigator !== "undefined" ? Navigator.prototype : null;

  (function () {
    if (!NP) return;
    M.hookGetter("navigator", NP, "hardwareConcurrency", function () { M.trigger("navigator"); return M.ST.hc; });
    M.hookGetter("navigator", NP, "deviceMemory", function () { return M.ST.dm; });
    M.hookGetter("navigator", NP, "userAgent", function (v) { M.trigger("navigator"); return M.ST.ua || v; });
    M.hookGetter("navigator", NP, "appVersion", function (v) { return M.ST.appVer || v; });
    M.hookGetter("navigator", NP, "platform", function (v) { return M.ST.platform || v; });
    M.hookGetter("navigator", NP, "vendor", function () { return "Google Inc."; });
    M.hookGetter("navigator", NP, "maxTouchPoints", function () { return M.ST.touch; });
    // Firefox-heritage constants Chrome genuinely exposes — pinned to Chrome's own values.
    M.hookGetter("locale", NP, "vendorSub", function () { return ""; });
    M.hookGetter("locale", NP, "productSub", function () { return "20030107"; });
    M.hookGetter("locale", NP, "product", function () { return "Gecko"; });
  })();

  // NETWORK INFORMATION — real effectiveType/rtt/downlink/saveData are stable & high-entropy.
  // Pinned to Chrome's common privacy-rounded "fast connection" output.
  (function () {
    if (typeof NetworkInformation === "undefined" || !NetworkInformation.prototype) return;
    var NI = NetworkInformation.prototype;
    M.hookGetter("navigator", NI, "effectiveType", function () { return "4g"; });
    M.hookGetter("navigator", NI, "rtt", function () { return 50; });
    M.hookGetter("navigator", NI, "downlink", function () { return 10; });
    M.hookGetter("navigator", NI, "saveData", function () { return false; });
  })();

  // STORAGE QUOTA — navigator.storage.estimate() leaks real free-disk size. Round to a
  // common value, derived from the (stable) legend seed so it is consistent across reloads.
  (function () {
    if (typeof StorageManager === "undefined" || !StorageManager.prototype) return;
    M.hookMethod("navigator", StorageManager.prototype, "estimate", function (orig) {
      return function () {
        if (!M.grp("navigator")) return orig.apply(this, arguments);
        M.trigger("navigator");
        var quota = [120, 250, 500][M.mFloor(M.hash(9911) * 3)] * 1000000000;
        return Promise.resolve({ quota: quota, usage: 0, usageDetails: {} });
      };
    });
  })();

  // SPEECH VOICES — the installed TTS voice list is very OS/locale specific and stable.
  // Return a compact locale-consistent set of network (Google) voices instead.
  (function () {
    if (typeof SpeechSynthesis === "undefined" || !SpeechSynthesis.prototype) return;
    var voices = null, voicesFor = null;

    function buildVoices() {
      var loc = M.ST.locale || "en-US", base = loc.split("-")[0];
      var list = [
        { name: "Google US English", lang: "en-US", def: base === "en" },
        { name: "Google UK English Female", lang: "en-GB", def: false },
        { name: "Google UK English Male", lang: "en-GB", def: false }
      ];
      var extra = {
        de: { name: "Google Deutsch", lang: "de-DE" }, fr: { name: "Google français", lang: "fr-FR" },
        es: { name: "Google español", lang: "es-ES" }, ru: { name: "Google русский", lang: "ru-RU" },
        ja: { name: "Google 日本語", lang: "ja-JP" }
      }[base];
      if (extra) list.unshift({ name: extra.name, lang: extra.lang, def: true });
      return list.map(function (v) {
        var o = { voiceURI: v.name, name: v.name, lang: v.lang, localService: false, default: !!v.def };
        try { if (typeof SpeechSynthesisVoice !== "undefined" && SpeechSynthesisVoice.prototype) Object.setPrototypeOf(o, SpeechSynthesisVoice.prototype); } catch (e) {}
        return o;
      });
    }

    M.hookMethod("locale", SpeechSynthesis.prototype, "getVoices", function (orig) {
      return function () {
        if (!M.grp("locale")) return orig.apply(this, arguments);
        try {
          if (voicesFor !== M.ST.legendId + ":" + M.ST.locale) { voices = buildVoices(); voicesFor = M.ST.legendId + ":" + M.ST.locale; }
          M.trigger("locale");
          return voices.slice();
        } catch (e) { return orig.apply(this, arguments); }
      };
    });
  })();

  // PLUGINS + MIMETYPES — desktop Chrome always ships 5 built-in PDF plugins; an empty
  // PluginArray under a desktop Chromium UA is a headless/spoof signal (bot-signal
  // isEmptyPlugins). Naive fakes fail the structural checks (fpscanner): wrong
  // toStringTag, broken mimeType.enabledPlugin identity, missing item()/namedItem().
  (function () {
    if (!NP) return;
    var built = null;

    function own(o, k, v) {
      try { M.defProp(o, k, { value: v, writable: false, enumerable: false, configurable: true }); } catch (e) {}
    }
    function maskFn(fn, orig) {
      if (orig) return M.makeNative(fn, orig);
      try { M.wmSet.call(M.fakeMap, fn, "function " + fn.name + "() { [native code] }"); } catch (e) {}
      return fn;
    }

    function build() {
      if (built) return built;
      var PAP = typeof PluginArray !== "undefined" ? PluginArray.prototype : null;
      var PP = typeof Plugin !== "undefined" ? Plugin.prototype : null;
      var MTAP = typeof MimeTypeArray !== "undefined" ? MimeTypeArray.prototype : null;
      var MTP = typeof MimeType !== "undefined" ? MimeType.prototype : null;

      var MIME_DEFS = [["application/pdf", "pdf"], ["text/pdf", "pdf"]];
      var PLUGIN_NAMES = ["PDF Viewer", "Chrome PDF Viewer", "Chromium PDF Viewer", "Microsoft Edge PDF Viewer", "WebKit built-in PDF"];
      var plugins = [], mimes = [];

      MIME_DEFS.forEach(function (md) {
        var mt = {};
        try { if (MTP) Object.setPrototypeOf(mt, MTP); } catch (e) {}
        own(mt, "type", md[0]);
        own(mt, "suffixes", md[1]);
        own(mt, "description", "Portable Document Format");
        mimes.push(mt);
      });

      PLUGIN_NAMES.forEach(function (pn) {
        var p = {};
        try { if (PP) Object.setPrototypeOf(p, PP); } catch (e) {}
        own(p, "name", pn);
        own(p, "filename", "internal-pdf-viewer");
        own(p, "description", "Portable Document Format");
        own(p, "length", mimes.length);
        mimes.forEach(function (mt, i) { own(p, i, mt); own(p, mt.type, mt); });
        own(p, "item", maskFn(function item(i) { return mimes[i] || null; }, PP && PP.item));
        own(p, "namedItem", maskFn(function namedItem(n) {
          for (var i = 0; i < mimes.length; i++) if (mimes[i].type === n) return mimes[i];
          return null;
        }, PP && PP.namedItem));
        plugins.push(p);
      });
      // Real Chrome: every built-in pdf mimeType resolves to the first plugin.
      mimes.forEach(function (mt) { own(mt, "enabledPlugin", plugins[0]); });

      var pa = {};
      try { if (PAP) Object.setPrototypeOf(pa, PAP); } catch (e) {}
      own(pa, "length", plugins.length);
      plugins.forEach(function (p, i) { own(pa, i, p); own(pa, p.name, p); });
      own(pa, "item", maskFn(function item(i) { return plugins[i] || null; }, PAP && PAP.item));
      own(pa, "namedItem", maskFn(function namedItem(n) {
        for (var i = 0; i < plugins.length; i++) if (plugins[i].name === n) return plugins[i];
        return null;
      }, PAP && PAP.namedItem));
      own(pa, "refresh", maskFn(function refresh() {}, PAP && PAP.refresh));

      var mta = {};
      try { if (MTAP) Object.setPrototypeOf(mta, MTAP); } catch (e) {}
      own(mta, "length", mimes.length);
      mimes.forEach(function (mt, i) { own(mta, i, mt); own(mta, mt.type, mt); });
      own(mta, "item", maskFn(function item(i) { return mimes[i] || null; }, MTAP && MTAP.item));
      own(mta, "namedItem", maskFn(function namedItem(n) {
        for (var i = 0; i < mimes.length; i++) if (mimes[i].type === n) return mimes[i];
        return null;
      }, MTAP && MTAP.namedItem));

      built = { pa: pa, mta: mta };
      return built;
    }

    // Identity must be stable across reads (detectors compare repeated accesses).
    M.hookGetter("navigator", NP, "plugins", function () { M.trigger("navigator"); return build().pa; });
    M.hookGetter("navigator", NP, "mimeTypes", function () { return build().mta; });
  })();
})();
