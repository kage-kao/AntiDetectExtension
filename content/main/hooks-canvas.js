// MAIN world: CANVAS — seeded noise on a copy (stable legend) or per-visit seed.
// Exports (toDataURL/toBlob/convertToBlob) render a noised copy; readbacks (getImageData)
// are perturbed in place. ~1% of pixels shifted by ±1 in one channel — invisible, but the
// hash changes.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;
  var mFloor = M.mFloor, mMax = M.mMax, hash = M.hash;

  M.perturbPixels = function (data) {
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
  };

  if (typeof HTMLCanvasElement === "undefined" || typeof CanvasRenderingContext2D === "undefined") return;
  var C2D = CanvasRenderingContext2D.prototype;
  var oGID = C2D.getImageData, oPID = C2D.putImageData, oDraw = C2D.drawImage;
  var oGetCtx = HTMLCanvasElement.prototype.getContext, createEl = Document.prototype.createElement;
  var perturb = M.perturbPixels;

  function noisyCopy(src) {
    var w = src.width, h = src.height;
    if (!w || !h || w * h > 16000000) return null;
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
      if (M.grp("canvas")) {
        var c = null;
        try { c = noisyCopy(this); } catch (e) {}
        if (c) { M.trigger("canvas"); return orig.apply(c, arguments); }
      }
      return orig.apply(this, arguments);
    };
  }
  M.hookMethod("canvas", HTMLCanvasElement.prototype, "toDataURL", exportHook);
  M.hookMethod("canvas", HTMLCanvasElement.prototype, "toBlob", exportHook);
  M.hookMethod("canvas", C2D, "getImageData", function (orig) {
    return function () {
      var img = orig.apply(this, arguments);
      if (M.grp("canvas")) { try { perturb(img.data); M.trigger("canvas"); } catch (e) {} }
      return img;
    };
  });

  if (typeof OffscreenCanvas !== "undefined") {
    var OC = OffscreenCanvas, oOcCtx = OC.prototype.getContext;
    var OC2D = typeof OffscreenCanvasRenderingContext2D !== "undefined" ? OffscreenCanvasRenderingContext2D.prototype : null;
    if (OC2D) {
      var ooGID = OC2D.getImageData, ooPID = OC2D.putImageData, ooDraw = OC2D.drawImage;
      M.hookMethod("canvas", OC.prototype, "convertToBlob", function (orig) {
        return function () {
          if (M.grp("canvas")) {
            try {
              var w = this.width, h = this.height;
              if (w && h && w * h <= 16000000) {
                var copy = new OC(w, h), ctx = oOcCtx.call(copy, "2d");
                ooDraw.call(ctx, this, 0, 0);
                var img = ooGID.call(ctx, 0, 0, w, h);
                perturb(img.data); ooPID.call(ctx, img, 0, 0);
                M.trigger("canvas");
                return orig.apply(copy, arguments);
              }
            } catch (e) {}
          }
          return orig.apply(this, arguments);
        };
      });
      M.hookMethod("canvas", OC2D, "getImageData", function (orig) {
        return function () {
          var img = orig.apply(this, arguments);
          if (M.grp("canvas")) { try { perturb(img.data); M.trigger("canvas"); } catch (e) {} }
          return img;
        };
      });
    }
  }
})();
