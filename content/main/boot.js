// MAIN world, last module: config event wiring + initial patch application + load guard.
//
// The legend arrives ONLY via the private EV_CFG event from the ISOLATED bridge. Until it
// lands, hooks run on the fully synthetic per-visit identity from state.js (no real values
// are ever exposed); they re-derive to the stable legend the moment the event fires.

(function () {
  "use strict";
  var GUARD = Symbol.for("__x7f3");
  if (self[GUARD]) return;
  var M = self.__ADEM;

  M.addEL.call(window, M.EV_CFG, function (e) {
    var d;
    try { d = M.jsonParse(String(e.detail)); } catch (err) { return; }
    if (!d || typeof d !== "object") return;
    M.cfg = { active: !!d.active, groups: d.groups || {}, mode: d.mode || "stable", legend: null };
    var lg = (M.cfg.mode === "stable" && d.legend && d.legend.id) ? d.legend : null;
    var id = lg ? lg.id : null;
    if (id !== M.ST.legendId || M.cfg.mode !== M.ST.mode) {
      M.ST = M.derive(lg);
    }
    maybeStubs();
    M.sync();
  });

  // Analytics SDK stubs consult live config, so once installed the group state at any
  // later moment (including toggles without reload) is honored. Installed lazily — only
  // when the group is actually on — so an analytics-off browser gains no new globals.
  function maybeStubs() {
    if (M.installStubs && M.wanted("analytics")) {
      try { M.installStubs(); } catch (e) {}
    }
  }
  maybeStubs();

  M.sync();

  // Mark the install complete: every module no-ops on re-injection from here on.
  try { M.defProp(self, GUARD, { value: 1, enumerable: false, configurable: false, writable: false }); } catch (e) {}
})();
