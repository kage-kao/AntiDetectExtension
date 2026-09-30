// MAIN world: SENSORS — motion/orientation listeners swallowed, Generic Sensor API
// constructors throw the same NotAllowedError a denied permission would.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  var evts = { devicemotion: 1, deviceorientation: 1, deviceorientationabsolute: 1 };
  M.hookMethod("sensors", EventTarget.prototype, "addEventListener", function (orig) {
    return function (type) {
      if (evts[type] && M.grp("sensors")) { M.trigger("sensors"); return; }
      return orig.apply(this, arguments);
    };
  });

  ["Gyroscope", "Accelerometer", "Magnetometer", "AbsoluteOrientationSensor", "RelativeOrientationSensor", "LinearAccelerationSensor"]
    .forEach(function (name) {
      if (!window[name]) return;
      M.hookMethod("sensors", window, name, function (Orig) {
        var W = function () {
          if (!M.grp("sensors")) return M.RConstruct(Orig, arguments);
          throw new DOMException("Not allowed", "NotAllowedError");
        };
        W.prototype = Orig.prototype;
        return W;
      });
    });
})();
