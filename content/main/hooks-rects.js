// MAIN world: CLIENT RECTS — real DOMRect objects with a legend-seeded scale.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  if (typeof DOMRect === "undefined" || typeof Element === "undefined") return;
  var DR = DOMRect;

  function noiseRect(r) {
    var ST = M.ST;
    return new DR(r.x + ST.rectEx, r.y + ST.rectEy, r.width * (1 + ST.rectEs), r.height * (1 + ST.rectEs));
  }

  function rectHook(orig) {
    return function () {
      var r = orig.apply(this, arguments);
      if (!M.grp("rects")) return r;
      try { M.trigger("rects"); return noiseRect(r); } catch (e) { return r; }
    };
  }
  M.hookMethod("rects", Element.prototype, "getBoundingClientRect", rectHook);
  if (typeof Range !== "undefined") M.hookMethod("rects", Range.prototype, "getBoundingClientRect", rectHook);

  function listHook(orig) {
    return function () {
      var list = orig.apply(this, arguments);
      if (!M.grp("rects")) return list;
      try {
        M.trigger("rects");
        return new M.PX(list, {
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
  M.hookMethod("rects", Element.prototype, "getClientRects", listHook);
  if (typeof Range !== "undefined") M.hookMethod("rects", Range.prototype, "getClientRects", listHook);
})();
