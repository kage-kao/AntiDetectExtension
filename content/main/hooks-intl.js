// MAIN world: LOCALE + TIMEZONE shared Intl layer (pseudo-group "intl": locale || timezone).
// navigator.language(s), every Intl constructor's default locale, resolvedOptions().

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;
  var NP = typeof Navigator !== "undefined" ? Navigator.prototype : null;

  M.explicitLoc = new WeakSet();
  M.explicitTZ = new WeakSet();

  (function () {
    if (!NP) return;
    M.hookGetter("locale", NP, "language", function () { return M.ST.locale; });
    // Single languages hook (locale wins, stealth only backfills empties): one wrapper per property.
    M.hookGetter("langq", NP, "languages", function (v) {
      if (M.grp("locale")) { M.trigger("locale"); return Object.freeze(M.ST.langs.slice()); }
      if (v && v.length) return v;
      M.trigger("stealth");
      return Object.freeze([M.ST.locale, M.ST.locale.split("-")[0]]);
    });
  })();

  (function () {
    if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return;

    // Wraps an Intl constructor so an omitted locales argument defaults to the legend
    // locale (and DateTimeFormat additionally gains the legend timeZone). Instances built
    // with explicit arguments are tagged so resolvedOptions() leaves them alone.
    function wrapIntlCtor(name, withTZ) {
      M.hookMethod("intl", Intl, name, function (Ctor) {
        var W = function () {
          var nt = new.target;
          var a = M.slice.call(arguments);
          try {
            var loc = a[0], hadLoc = typeof loc !== "undefined";
            var hadTZ = false;
            if (withTZ) {
              var o = a[1];
              if (o === undefined || o === null) { o = {}; a[1] = o; }
              else if (typeof o === "object") { o = Object.assign({}, o); a[1] = o; }
              else { o = {}; a[1] = o; }
              hadTZ = !!(o && typeof o === "object" && "timeZone" in o);
              if (M.grp("timezone") && !hadTZ) a[1] = Object.assign({}, o, { timeZone: M.ST.tzName });
            }
            if (M.grp("locale") && !hadLoc) a[0] = M.ST.locale;
            var inst = M.RConstruct(Ctor, a, nt || Ctor);
            if (hadLoc) { try { M.explicitLoc.add(inst); } catch (e) {} }
            if (withTZ && hadTZ) { try { M.explicitTZ.add(inst); } catch (e) {} }
            return inst;
          } catch (e) { return M.RConstruct(Ctor, arguments, nt || Ctor); }
        };
        W.prototype = Ctor.prototype;
        try { M.defProp(Ctor.prototype, "constructor", { value: W, writable: true, enumerable: false, configurable: true }); } catch (e) {}
        try { M.defProp(W, "name", { value: name, configurable: true }); } catch (e) {}
        try { if (Ctor.supportedLocalesOf) W.supportedLocalesOf = M.makeNative(function () { return Ctor.supportedLocalesOf.apply(Ctor, arguments); }, Ctor.supportedLocalesOf); } catch (e) {}
        return W;
      });
    }

    wrapIntlCtor("DateTimeFormat", true);
    // Every other Intl constructor defaults to the REAL locale, contradicting
    // navigator.language + DateTimeFormat (a strong CreepJS signal). Pin them all.
    ["NumberFormat", "Collator", "PluralRules", "RelativeTimeFormat", "ListFormat", "DisplayNames", "Segmenter"]
      .forEach(function (name) { if (typeof Intl[name] === "function") wrapIntlCtor(name, false); });

    function localeFix(orig) {
      return function () {
        var o = orig.apply(this, arguments);
        try {
          if (M.grp("locale") && o && !M.wsHas.call(M.explicitLoc, this) && o.locale !== M.ST.locale) o.locale = M.ST.locale;
          if (M.grp("timezone") && o && !M.wsHas.call(M.explicitTZ, this) && M.ST.tzName && o.timeZone !== M.ST.tzName) o.timeZone = M.ST.tzName;
        } catch (e) {}
        return o;
      };
    }
    M.hookMethod("intl", Intl.DateTimeFormat.prototype, "resolvedOptions", localeFix);
    if (Intl.NumberFormat) M.hookMethod("intl", Intl.NumberFormat.prototype, "resolvedOptions", localeFix);
  })();
})();
