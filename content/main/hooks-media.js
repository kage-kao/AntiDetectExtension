// MAIN world: MEDIA DEVICES — one anonymous entry per kind.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  if (typeof MediaDevices === "undefined") return;

  function anonDevice(kind) {
    var o = { deviceId: "", groupId: "", kind: kind, label: "" };
    o.toJSON = function () { return { deviceId: "", groupId: "", kind: o.kind, label: "" }; };
    return o;
  }

  M.hookMethod("media", MediaDevices.prototype, "enumerateDevices", function (orig) {
    return function () {
      var p = orig.apply(this, arguments);
      if (!M.grp("media")) return p;
      return p.then(function (devs) {
        try {
          var seen = {}, out = [];
          devs.forEach(function (d) {
            if (seen[d.kind]) return;
            seen[d.kind] = 1;
            out.push(anonDevice(d.kind));
          });
          if (!out.length && M.ST.stable) {
            ["audioinput", "audiooutput", "videoinput"].forEach(function (kind) { out.push(anonDevice(kind)); });
          }
          M.trigger("media");
          return out;
        } catch (e) { return devs; }
      });
    };
  });
})();
