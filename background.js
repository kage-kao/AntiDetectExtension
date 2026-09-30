// AntiDetectExtension service worker — thin entry point.
// All logic lives in the bg/* modules; they share this worker's global scope via
// importScripts (plain top-level `var`/functions, no bundler needed). Load order matters:
// shared helpers first, event wiring (bg/init.js) last.

importScripts(
  "shared/common.js",
  "shared/profiles.js",
  "shared/trackers-db.js",
  "bg/stats.js",
  "bg/rules.js",
  "bg/badger.js",
  "bg/cookies.js",
  "bg/injector.js",
  "bg/sites.js",
  "bg/forget.js",
  "bg/init.js"
);
