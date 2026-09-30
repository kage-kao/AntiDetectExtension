// MAIN world, module 1: shared environment for every hook module.
// Everything hangs off self.__ADEM so the split files (loaded as separate scripts into the
// same MAIN world) share one state. Re-injection safety: each module no-ops once the guard
// is set; boot.js (the last module) sets it after a successful install.

(function () {
  "use strict";
  var GUARD = Symbol.for("__x7f3");
  if (self[GUARD]) return;

  var M = self.__ADEM || (self.__ADEM = {});
  M.GUARD = GUARD;
  M.EV_CFG = "__x7f3cfg";
  M.EV_TRIG = "__x7f3trg";

  // Boot flags: group on/off state delivered synchronously by the tiny content/flags/*.js
  // files (registered ahead of us), so hooks start in the right state before EV_CFG lands.
  var boot = null;
  try { boot = self.__ade_flags || null; delete self.__ade_flags; } catch (e) {}

  // Never touch Cloudflare challenge machinery (it legitimately needs the real environment).
  try {
    var h0 = (location.hostname || "").replace(/^www\./, "").toLowerCase();
    if (h0 === "challenges.cloudflare.com" || h0.endsWith(".challenges.cloudflare.com") ||
        h0 === "turnstile.cloudflare.com" || /\/cdn-cgi\/challenge-platform\//.test(location.pathname || "")) {
      defPropSelf();
      return;
    }
  } catch (e) {}
  function defPropSelf() {
    try { Object.defineProperty(self, GUARD, { value: 1, enumerable: false, configurable: false, writable: false }); } catch (e) {}
  }

  // ---- cached natives (page code can't poison our calls later) ----
  M.gOPD = Object.getOwnPropertyDescriptor;
  M.defProp = Object.defineProperty;
  M.addEL = EventTarget.prototype.addEventListener;
  M.dispatchEv = EventTarget.prototype.dispatchEvent;
  M.CE = CustomEvent;
  M.jsonParse = JSON.parse;
  M.jsonStringify = JSON.stringify;
  M.slice = Array.prototype.slice;
  M.mFloor = Math.floor;
  M.mImul = Math.imul;
  M.mMax = Math.max;
  M.mAbs = Math.abs;
  M.mMin = Math.min;
  M.nativeToString = Function.prototype.toString;
  M.wmGet = WeakMap.prototype.get;
  M.wmHas = WeakMap.prototype.has;
  M.wmSet = WeakMap.prototype.set;
  M.wsHas = WeakSet.prototype.has;
  M.RConstruct = Reflect.construct;
  M.PX = Proxy;

  M.GROUPS = ["canvas", "webgl", "audio", "rects", "fonts", "navigator", "screen", "uach",
    "locale", "geo", "timezone", "webrtc", "battery", "media", "beacon", "analytics", "sensors", "workers", "stealth", "gpc", "adtech"];

  // Live config + spoof state. Mutated by boot.js when EV_CFG arrives; hook modules must
  // always read M.cfg / M.ST at call time, never cache them at load time.
  M.cfg = { active: !!(boot && boot.on), groups: {}, mode: "stable", legend: null };
  for (var gi = 0; gi < M.GROUPS.length; gi++) M.cfg.groups[M.GROUPS[gi]] = !!(boot && boot[M.GROUPS[gi]]);

  M.grp = function (n) { return M.cfg.active && !!M.cfg.groups[n]; };
  // Pseudo-groups that back combined hooks (one property governed by several switches).
  M.wanted = function (g) {
    if (g === "intl") return M.cfg.active && (!!M.cfg.groups.locale || !!M.cfg.groups.timezone);
    if (g === "privq") return M.cfg.active && (!!M.cfg.groups.stealth || !!M.cfg.groups.geo);
    if (g === "langq") return M.cfg.active && (!!M.cfg.groups.locale || !!M.cfg.groups.stealth);
    if (g === "beaconq") return M.cfg.active && (!!M.cfg.groups.beacon || !!M.cfg.groups.analytics);
    return M.grp(g);
  };

  M.rand32 = function () {
    try { var sa = new Uint32Array(1); crypto.getRandomValues(sa); return sa[0]; }
    catch (e) { return (Math.random() * 4294967296) >>> 0; }
  };

  M.detectOS = function () {
    var p = "";
    try { p = String(navigator.platform || "") + " " + String(navigator.userAgent || ""); } catch (e) {}
    if (/Mac/i.test(p)) return "mac";
    if (/Win/i.test(p)) return "win";
    return "linux";
  };

  // One seeded mixer for every noise source. hash(seed, n) -> [0,1)
  M.hashSeed = function (seed, n) {
    var x = ((seed >>> 0) ^ M.mImul(n | 0, 0x9E3779B1)) >>> 0;
    x = M.mImul(x ^ (x >>> 16), 0x85EBCA6B);
    x = M.mImul(x ^ (x >>> 13), 0xC2B2AE35);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
  };
  M.hash = function (n) { return M.hashSeed(M.ST.seed, n); };

  // Throttled "protection fired" beacons for the popup counter.
  var reported = 0;
  M.trigger = function (kind) {
    if (reported++ % 3) return;
    try { M.dispatchEv.call(window, new M.CE(M.EV_TRIG, { detail: kind })); } catch (e) {}
  };

  // ---- native-code masking (Function.prototype.toString patch lives in hooks-core) ----
  M.fakeMap = new WeakMap();
  M.makeNative = function (fn, orig) {
    try {
      M.wmSet.call(M.fakeMap, fn, orig);
      M.defProp(fn, "name", { value: orig.name, configurable: true });
      M.defProp(fn, "length", { value: orig.length, configurable: true });
    } catch (e) {}
    return fn;
  };

  // ---- patch registry: hooks are applied/removed live as groups toggle ----
  M.patches = {};
  M.reg = function (group, obj, name, orig, repl) {
    (M.patches[group] || (M.patches[group] = [])).push({ obj: obj, name: name, orig: orig, repl: repl, on: false, stuck: false });
  };
  M.hookMethod = function (group, obj, name, factory) {
    if (!obj) return;
    var d = M.gOPD(obj, name);
    if (!d || typeof d.value !== "function" || !d.configurable) return;
    var w = M.makeNative(factory(d.value), d.value);
    M.reg(group, obj, name, d, { value: w, writable: d.writable, enumerable: d.enumerable, configurable: true });
  };
  M.hookGetter = function (group, obj, name, spoof) {
    if (!obj) return;
    var d = M.gOPD(obj, name);
    if (!d || !d.get || !d.configurable) return;
    var ng = d.get;
    var g = M.makeNative(function () {
      var v = ng.call(this);
      return M.wanted(group) ? spoof.call(this, v) : v;
    }, ng);
    M.reg(group, obj, name, d, { get: g, set: d.set, enumerable: d.enumerable, configurable: true });
  };
  function applyPatch(p) {
    if (p.on) return;
    if (p.stuck) { p.on = true; p.stuck = false; return; }
    try { M.defProp(p.obj, p.name, p.repl); p.on = true; } catch (e) {}
  }
  function removePatch(p) {
    if (!p.on) return;
    try {
      var cur = M.gOPD(p.obj, p.name);
      var ours = cur && ("value" in p.repl ? cur.value === p.repl.value : cur.get === p.repl.get);
      if (!ours) p.stuck = true;
      else if (p.orig) M.defProp(p.obj, p.name, p.orig);
      else delete p.obj[p.name];
    } catch (e) { p.stuck = true; }
    p.on = false;
  }
  M.applyPatch = applyPatch;
  M.removePatch = removePatch;

  var busy = false;
  M.sync = function () {
    if (busy) return;
    busy = true;
    try {
      var order = M.GROUPS.concat(["intl", "privq", "langq", "beaconq"]), anyStuck = false, i, j, list;
      if (M.cfg.active) (M.patches.core || []).forEach(applyPatch);
      for (i = 0; i < order.length; i++) {
        list = M.patches[order[i]] || [];
        for (j = 0; j < list.length; j++) {
          if (M.wanted(order[i])) applyPatch(list[j]); else removePatch(list[j]);
          if (list[j].stuck) anyStuck = true;
        }
      }
      if (!M.cfg.active && !anyStuck) (M.patches.core || []).forEach(removePatch);
    } finally { busy = false; }
  };
})();
