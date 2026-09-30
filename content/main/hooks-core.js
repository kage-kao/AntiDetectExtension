// MAIN world: CORE — Function.prototype.toString masking.
// Every spoofed function/getter is registered in fakeMap; this patch makes their
// .toString() answer the original "[native code]" source instead of our wrapper.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;

  M.patchedToString = M.makeNative(function toString() {
    if (typeof this === "function" && M.wmHas.call(M.fakeMap, this)) {
      var o = M.wmGet.call(M.fakeMap, this);
      return typeof o === "string" ? o : M.nativeToString.call(o);
    }
    return M.nativeToString.call(this);
  }, M.nativeToString);

  var d = M.gOPD(Function.prototype, "toString");
  if (d) {
    M.reg("core", Function.prototype, "toString", d,
      { value: M.patchedToString, writable: true, enumerable: false, configurable: true });
  }
})();
