// MAIN world: WEBRTC — no STUN, raw-IP ICE candidates dropped (mDNS .local only).

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  function leaks(ev) {
    try {
      var c = ev && ev.candidate;
      if (!c) return false;
      var a = c.address || String(c.candidate || "").split(" ")[4] || "";
      return !!a && !/\.local$/i.test(a);
    } catch (e) { return false; }
  }

  function wrapCtor(name) {
    M.hookMethod("webrtc", window, name, function (Ctor) {
      var W = function RTCPeerConnection(conf) {
        if (!new.target) throw new TypeError("Failed to construct '" + name + "': Please use the 'new' operator, this DOM object constructor cannot be called as a function.");
        if (!M.grp("webrtc")) return M.RConstruct(Ctor, arguments, new.target);
        try { conf = Object.assign({}, conf || {}, { iceServers: [] }); } catch (e) { conf = { iceServers: [] }; }
        var pc = new Ctor(conf), oAdd = pc.addEventListener;
        try {
          M.defProp(pc, "addEventListener", { configurable: true, writable: true, value: M.makeNative(function (type, listener, opts) {
            if (type === "icecandidate" && typeof listener === "function") {
              return oAdd.call(this, type, function (ev) { if (leaks(ev)) return; return listener.apply(this, arguments); }, opts);
            }
            return oAdd.apply(this, arguments);
          }, oAdd) });
          var hd = M.gOPD(Ctor.prototype, "onicecandidate");
          if (hd && hd.set) {
            M.defProp(pc, "onicecandidate", { configurable: true, get: function () { return hd.get.call(this); }, set: function (fn) {
              hd.set.call(this, typeof fn === "function" ? function (ev) { if (leaks(ev)) return; return fn.apply(this, arguments); } : fn);
            } });
          }
        } catch (e) {}
        M.trigger("webrtc");
        return pc;
      };
      W.prototype = Ctor.prototype;
      try { M.defProp(Ctor.prototype, "constructor", { value: W, writable: true, enumerable: false, configurable: true }); } catch (e) {}
      try {
        if (typeof Ctor.generateCertificate === "function") {
          W.generateCertificate = M.makeNative(function () { return Ctor.generateCertificate.apply(Ctor, arguments); }, Ctor.generateCertificate);
        }
      } catch (e) {}
      return W;
    });
  }

  if (window.RTCPeerConnection) wrapCtor("RTCPeerConnection");
  if (window.webkitRTCPeerConnection && window.webkitRTCPeerConnection !== window.RTCPeerConnection) wrapCtor("webkitRTCPeerConnection");
})();
