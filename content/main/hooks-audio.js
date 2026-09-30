// MAIN world: AUDIO — seeded per-buffer noise + legend sampleRate.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  if (typeof AudioBuffer !== "undefined") {
    var AB = AudioBuffer.prototype, oGetCh = AB.getChannelData, noised = new WeakMap();

    function noiseChannel(buf, ch) {
      var data = oGetCh.call(buf, ch);
      var marks = M.wmGet.call(noised, buf) || {};
      if (!marks[ch]) {
        for (var i = 0; i < data.length; i += 100) data[i] += (M.hash(i + ch * 7919) * 2 - 1) * 1e-7;
        marks[ch] = 1;
        M.wmSet.call(noised, buf, marks);
      }
      return data;
    }

    M.hookMethod("audio", AB, "getChannelData", function (orig) {
      return function (ch) {
        if (!M.grp("audio")) return orig.apply(this, arguments);
        try { var d = noiseChannel(this, ch); M.trigger("audio"); return d; } catch (e) { return orig.apply(this, arguments); }
      };
    });
    M.hookMethod("audio", AB, "copyFromChannel", function (orig) {
      return function (dest, ch) {
        if (M.grp("audio")) { try { noiseChannel(this, ch); M.trigger("audio"); } catch (e) {} }
        return orig.apply(this, arguments);
      };
    });

    if (typeof AnalyserNode !== "undefined") {
      M.hookMethod("audio", AnalyserNode.prototype, "getFloatFrequencyData", function (orig) {
        return function (arr) {
          var r = orig.apply(this, arguments);
          if (M.grp("audio")) { try { for (var i = 0; i < arr.length; i += 50) arr[i] += (M.hash(i + 31) * 2 - 1) * 1e-4; M.trigger("audio"); } catch (e) {} }
          return r;
        };
      });
      M.hookMethod("audio", AnalyserNode.prototype, "getByteFrequencyData", function (orig) {
        return function (arr) {
          var r = orig.apply(this, arguments);
          if (M.grp("audio")) { try { for (var i = 0; i < arr.length; i += 50) if (M.hash(i + 37) < 0.5) arr[i] = arr[i] ^ 1; M.trigger("audio"); } catch (e) {} }
          return r;
        };
      });
    }
  }

  var BAC = typeof BaseAudioContext !== "undefined" ? BaseAudioContext.prototype : null;
  if (BAC) {
    M.hookGetter("audio", BAC, "sampleRate", function () { return M.ST.sampleRate; });
  } else {
    if (typeof AudioContext !== "undefined") M.hookGetter("audio", AudioContext.prototype, "sampleRate", function () { return M.ST.sampleRate; });
    if (typeof OfflineAudioContext !== "undefined") M.hookGetter("audio", OfflineAudioContext.prototype, "sampleRate", function () { return M.ST.sampleRate; });
  }
})();
