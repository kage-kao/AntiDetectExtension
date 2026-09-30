// MAIN world: FONTS — text metrics scale + document.fonts.check() admits only the
// legend's font set.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  if (typeof CanvasRenderingContext2D !== "undefined") {
    M.hookMethod("fonts", CanvasRenderingContext2D.prototype, "measureText", function (orig) {
      return function () {
        var m = orig.apply(this, arguments);
        if (!M.grp("fonts")) return m;
        try {
          M.trigger("fonts");
          var k = M.ST.fontK;
          return new M.PX(m, { get: function (t, key) { if (key === "width") return t.width * k; var v = t[key]; return typeof v === "function" ? v.bind(t) : v; } });
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
    M.hookMethod("fonts", FontFaceSet.prototype, "check", function (orig) {
      return function (font) {
        if (!M.grp("fonts")) return orig.apply(this, arguments);
        try {
          var fams = familiesIn(font), set = {};
          M.ST.fonts.forEach(function (f) { set[String(f).toLowerCase()] = 1; });
          for (var i = 0; i < fams.length; i++) {
            if (GENERIC[fams[i]]) continue;
            if (!set[fams[i]]) return false;
          }
          M.trigger("fonts");
        } catch (e) {}
        return orig.apply(this, arguments);
      };
    });
  }
})();
