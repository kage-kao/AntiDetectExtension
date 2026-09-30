// MAIN world: TIMEZONE — DST-aware offsets, zone-consistent Date getters and strings.

(function () {
  "use strict";
  if (self[Symbol.for("__x7f3")]) return;
  var M = self.__ADEM;
  var mFloor = M.mFloor, mAbs = M.mAbs;

  function nthWeekday(y, m, wd, n) {
    var dow = new Date(Date.UTC(y, m, 1)).getUTCDay();
    return 1 + ((wd - dow + 7) % 7) + (n - 1) * 7;
  }
  function lastWeekday(y, m, wd) {
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    var dow = new Date(Date.UTC(y, m, last)).getUTCDay();
    return last - ((dow - wd + 7) % 7);
  }

  function tzOffset(d) {
    var ST = M.ST;
    var S = ST.tzStd, rule = ST.tzRule || "none";
    if (rule === "none") return S;
    var t;
    try { t = d.getTime(); } catch (e) { return S; }
    if (rule === "us") {
      var y = new Date(t).getUTCFullYear();
      var s = Date.UTC(y, 2, nthWeekday(y, 2, 0, 2), 2, 0) + S * 60000;
      var e2 = Date.UTC(y, 10, nthWeekday(y, 10, 0, 1), 2, 0) + (S - 60) * 60000;
      return (t >= s && t < e2) ? S - 60 : S;
    }
    if (rule === "eu") {
      var y2 = new Date(t).getUTCFullYear();
      var s2 = Date.UTC(y2, 2, lastWeekday(y2, 2, 0), 1, 0);
      var e3 = Date.UTC(y2, 9, lastWeekday(y2, 9, 0), 1, 0);
      return (t >= s2 && t < e3) ? S - 60 : S;
    }
    if (rule === "au") {
      var y3 = new Date(t).getUTCFullYear();
      var s3 = Date.UTC(y3, 9, nthWeekday(y3, 9, 0, 1), 2, 0) + S * 60000;
      var e4 = Date.UTC(y3, 3, nthWeekday(y3, 3, 0, 1), 3, 0) + (S - 60) * 60000;
      return (t >= s3 || t < e4) ? S - 60 : S;
    }
    return S;
  }
  M.tzOffset = tzOffset;

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function tzLongName(d) {
    try {
      var parts = new Intl.DateTimeFormat("en-US", { timeZone: M.ST.tzName, timeZoneName: "long" }).formatToParts(d);
      for (var i = 0; i < parts.length; i++) if (parts[i].type === "timeZoneName") return parts[i].value;
    } catch (e) {}
    return "";
  }

  function dParts(d) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: M.ST.tzName, weekday: "short", year: "numeric", month: "numeric",
      day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hour12: false
    }).formatToParts(d);
    var m = {};
    for (var i = 0; i < parts.length; i++) m[parts[i].type] = parts[i].value;
    var wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[m.weekday];
    var hr = parseInt(m.hour, 10);
    if (hr === 24) hr = 0;
    return { y: parseInt(m.year, 10), mo: parseInt(m.month, 10) - 1, d: parseInt(m.day, 10), wd: wd, h: hr, mi: parseInt(m.minute, 10), s: parseInt(m.second, 10) };
  }

  if (typeof Date === "undefined" || !Date.prototype) return;
  var DP = Date.prototype;

  M.hookMethod("timezone", DP, "getTimezoneOffset", function (orig) {
    return function () {
      if (!M.grp("timezone")) return orig.apply(this, arguments);
      M.trigger("timezone");
      try { return tzOffset(this); } catch (e) { return orig.apply(this, arguments); }
    };
  });

  function getterHook(name, pick) {
    M.hookMethod("timezone", DP, name, function (orig) {
      return function () {
        if (!M.grp("timezone")) return orig.apply(this, arguments);
        try { return pick(dParts(this)); } catch (e) { return orig.apply(this, arguments); }
      };
    });
  }
  getterHook("getFullYear", function (p) { return p.y; });
  getterHook("getMonth", function (p) { return p.mo; });
  getterHook("getDate", function (p) { return p.d; });
  getterHook("getDay", function (p) { return p.wd; });
  getterHook("getHours", function (p) { return p.h; });
  getterHook("getMinutes", function (p) { return p.mi; });
  getterHook("getSeconds", function (p) { return p.s; });
  getterHook("getYear", function (p) { return p.y - 1900; });

  function strHook(orig) {
    return function () {
      if (!M.grp("timezone") || !M.ST.tzName) return orig.apply(this, arguments);
      try {
        var d = this, off = tzOffset(d), s = orig.apply(d, arguments);
        var a = mAbs(off), gmt = "GMT" + (off <= 0 ? "+" : "-") + pad2(mFloor(a / 60)) + pad2(a % 60);
        s = String(s).replace(/GMT[+-]\d{4}/, gmt);
        var lz = tzLongName(d);
        if (lz) s = s.replace(/\s\(.*\)$/, " (" + lz + ")");
        M.trigger("timezone");
        return s;
      } catch (e) { return orig.apply(this, arguments); }
    };
  }
  M.hookMethod("timezone", DP, "toString", strHook);
  M.hookMethod("timezone", DP, "toTimeString", strHook);

  function locHook(orig) {
    return function () {
      if (!M.grp("timezone") && !M.grp("locale")) return orig.apply(this, arguments);
      try {
        var a = M.slice.call(arguments);
        if (M.grp("locale") && typeof a[0] === "undefined") a[0] = M.ST.locale;
        if (M.grp("timezone")) {
          var o = a[1];
          if (o === undefined || o === null) a[1] = { timeZone: M.ST.tzName };
          else if (typeof o === "object" && !("timeZone" in o)) { o = Object.assign({}, o); o.timeZone = M.ST.tzName; a[1] = o; }
        }
        return orig.apply(this, a);
      } catch (e) { return orig.apply(this, arguments); }
    };
  }
  M.hookMethod("timezone", DP, "toLocaleString", locHook);
  M.hookMethod("timezone", DP, "toLocaleDateString", locHook);
  M.hookMethod("timezone", DP, "toLocaleTimeString", locHook);
})();
