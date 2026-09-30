// MAIN world: GEO — legend coordinates with GPS-like micro-jitter (OFF by default:
// enable only when the IP matches the profile country).

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  var geoSeq = 0;
  var fakeWatchIds = {}; // ids we issued — only those may be swallowed by clearWatch

  function fakePosition() {
    var i = geoSeq++;
    var j = function (s) { return (M.hash(9000 + i * 4 + s) - 0.5); };
    var ST = M.ST;
    var pos = {
      coords: {
        latitude: ST.lat + j(1) * 0.0009,
        longitude: ST.lon + j(2) * 0.0009,
        accuracy: ST.acc + M.mFloor(j(3) * 8),
        altitude: null, altitudeAccuracy: null, heading: null, speed: null
      },
      timestamp: Date.now()
    };
    pos.toJSON = function () {
      return { coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: pos.timestamp };
    };
    return pos;
  }

  var GP = null;
  try { GP = navigator.geolocation ? Object.getPrototypeOf(navigator.geolocation) : null; } catch (e) {}
  if (!GP && typeof Geolocation !== "undefined") { try { GP = Geolocation.prototype; } catch (e) {} }
  if (!GP) return;

  function geoReady() {
    return M.grp("geo") && M.ST.lat !== null && M.ST.lat !== undefined;
  }

  M.hookMethod("geo", GP, "getCurrentPosition", function (orig) {
    return function (ok, err) {
      if (!geoReady()) return orig.apply(this, arguments);
      M.trigger("geo");
      var self = this;
      if (typeof ok === "function") setTimeout(function () { try { ok.call(self, fakePosition()); } catch (e) { try { err && err.call(self, e); } catch (x) {} } }, 0);
      else if (typeof err === "function") setTimeout(function () { try { err.call(self, { code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1 }); } catch (e) {} }, 0);
    };
  });

  M.hookMethod("geo", GP, "watchPosition", function (orig) {
    return function (ok) {
      if (!geoReady()) return orig.apply(this, arguments);
      M.trigger("geo");
      var self = this, id = 1000 + (geoSeq++);
      fakeWatchIds[id] = 1;
      if (typeof ok === "function") setTimeout(function () { try { ok.call(self, fakePosition()); } catch (e) {} }, 0);
      return id;
    };
  });

  M.hookMethod("geo", GP, "clearWatch", function (orig) {
    return function (id) {
      // Only swallow ids WE issued; watches started while the group was off (or by real
      // code paths) must reach the real implementation.
      if (M.grp("geo") && fakeWatchIds[id]) { delete fakeWatchIds[id]; return; }
      return orig.apply(this, arguments);
    };
  });
})();
