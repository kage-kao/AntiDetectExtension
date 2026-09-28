// Legend profiles: one seed -> one fully consistent identity (OS, GPU, screen, TZ, locale, geo...).
// Pure deterministic code, no chrome APIs. Shared by SW, popup, options and the MAIN-world hooks.

var ADE_CHROME_POOL = ["126.0.0.0", "127.0.0.0", "128.0.0.0", "129.0.0.0", "130.0.0.0", "131.0.0.0"];

var ADE_PRESETS = [
  { id: "us-ny", city: "New York", cc: "US", tz: "America/New_York", std: 300, dst: "us", locale: "en-US", langs: ["en-US", "en"], lat: 40.7128, lon: -74.006, acc: 28 },
  { id: "us-la", city: "Los Angeles", cc: "US", tz: "America/Los_Angeles", std: 480, dst: "us", locale: "en-US", langs: ["en-US", "en"], lat: 34.0522, lon: -118.2437, acc: 32 },
  { id: "gb", city: "London", cc: "GB", tz: "Europe/London", std: 0, dst: "eu", locale: "en-GB", langs: ["en-GB", "en"], lat: 51.5074, lon: -0.1278, acc: 25 },
  { id: "de", city: "Berlin", cc: "DE", tz: "Europe/Berlin", std: -60, dst: "eu", locale: "de-DE", langs: ["de-DE", "de"], lat: 52.52, lon: 13.405, acc: 22 },
  { id: "fr", city: "Paris", cc: "FR", tz: "Europe/Paris", std: -60, dst: "eu", locale: "fr-FR", langs: ["fr-FR", "fr"], lat: 48.8566, lon: 2.3522, acc: 24 },
  { id: "es", city: "Madrid", cc: "ES", tz: "Europe/Madrid", std: -60, dst: "eu", locale: "es-ES", langs: ["es-ES", "es"], lat: 40.4168, lon: -3.7038, acc: 26 },
  { id: "ru", city: "Moscow", cc: "RU", tz: "Europe/Moscow", std: -180, dst: "none", locale: "ru-RU", langs: ["ru-RU", "ru"], lat: 55.7558, lon: 37.6173, acc: 30 },
  { id: "jp", city: "Tokyo", cc: "JP", tz: "Asia/Tokyo", std: -540, dst: "none", locale: "ja-JP", langs: ["ja-JP", "ja"], lat: 35.6762, lon: 139.6503, acc: 21 },
  { id: "au", city: "Sydney", cc: "AU", tz: "Australia/Sydney", std: -600, dst: "au", locale: "en-AU", langs: ["en-AU", "en"], lat: -33.8688, lon: 151.2093, acc: 27 }
];

var ADE_OS_LIST = ["win", "mac", "linux"];

var ADE_GPU_POOLS = {
  win: [
    ["Google Inc. (Intel)", "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
    ["Google Inc. (Intel)", "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"],
    ["Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
    ["Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
    ["Google Inc. (NVIDIA)", "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)"],
    ["Google Inc. (AMD)", "ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)"],
    ["Google Inc. (AMD)", "ANGLE (AMD, AMD Radeon RX 780M Direct3D11 vs_5_0 ps_5_0, D3D11)"]
  ],
  mac: [
    ["Google Inc. (Apple)", "ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)"],
    ["Google Inc. (Apple)", "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)"],
    ["Google Inc. (Apple)", "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)"],
    ["Google Inc. (Apple)", "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)"],
    ["Google Inc. (Apple)", "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)"]
  ],
  linux: [
    ["Google Inc. (Intel)", "ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)"],
    ["Google Inc. (AMD)", "ANGLE (AMD, AMD Radeon Graphics (renoir, LLVM 15.0.7, DRM 3.49), OpenGL 4.6)"],
    ["Google Inc. (AMD)", "ANGLE (AMD, AMD Radeon RX 780M (RDNA3, LLVM 17.0.6, DRM 3.57), OpenGL 4.6)"],
    ["Google Inc. (NVIDIA Corporation)", "ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1060/PCIe/SSE2, OpenGL 4.5.0)"]
  ]
};

var ADE_FONTS = {
  win: ["Arial", "Calibri", "Cambria", "Comic Sans MS", "Consolas", "Courier New", "Georgia", "Impact", "Lucida Console", "Microsoft Sans Serif", "Palatino Linotype", "Segoe UI", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana"],
  mac: ["American Typewriter", "Andale Mono", "Arial", "Avenir", "Baskerville", "Courier New", "Geneva", "Georgia", "Helvetica", "Helvetica Neue", "Menlo", "Monaco", "Optima", "Times", "Times New Roman", "Verdana"],
  linux: ["DejaVu Sans", "DejaVu Sans Mono", "DejaVu Serif", "Droid Sans", "Droid Sans Mono", "FreeMono", "FreeSans", "Liberation Mono", "Liberation Sans", "Liberation Serif", "Noto Sans", "Ubuntu", "Ubuntu Mono"]
};

var ADE_HW_PAIRS = [[4, 4], [6, 8], [8, 8], [8, 16], [12, 16], [12, 32], [16, 32]];
var ADE_SCREENS = [[1366, 768], [1440, 900], [1536, 864], [1600, 900], [1920, 1080], [2048, 1152], [2560, 1440]];
var ADE_PV = {
  win: ["13.0.0", "14.0.0", "15.0.0"],
  mac: ["13.6.0", "14.5.0", "15.1.0"],
  linux: ["6.1.0", "6.5.0", "6.8.0"]
};

function ADE_mulberry(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ADE_preset(id) {
  for (var i = 0; i < ADE_PRESETS.length; i++) {
    if (ADE_PRESETS[i].id === id) return ADE_PRESETS[i];
  }
  return ADE_PRESETS[3];
}

function ADE_buildUA(os, chromeV) {
  if (os === "mac") return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + chromeV + " Safari/537.36";
  if (os === "linux") return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + chromeV + " Safari/537.36";
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + chromeV + " Safari/537.36";
}

function ADE_generateProfile(presetId, os, seed) {
  if (seed === undefined) seed = (Math.random() * 4294967296) >>> 0;
  var rnd = ADE_mulberry(seed);
  var pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };
  var pre = ADE_preset(presetId);
  if (ADE_OS_LIST.indexOf(os) < 0) os = "win";
  var chromeV = pick(ADE_CHROME_POOL);
  var major = chromeV.split(".")[0];
  var hw = pick(ADE_HW_PAIRS);
  var scr = pick(ADE_SCREENS);
  var dpr = scr[0] >= 2560 ? pick([1.5, 2]) : pick([1, 1, 1.25, 1.5, 2]);
  var gpu = pick(ADE_GPU_POOLS[os]);
  var touch = os === "win" ? pick([0, 0, 0, 5, 10]) : 0;
  var langs = pre.langs.slice();
  var base = pre.locale.split("-")[0];
  var acceptLang = pre.locale + "," + base + ";q=0.9" + (base === "en" ? "" : ",en;q=0.8");
  var platform = os === "win" ? "Win32" : (os === "mac" ? "MacIntel" : "Linux x86_64");
  var uaPlatform = os === "win" ? "Windows" : (os === "mac" ? "macOS" : "Linux");
  return {
    id: "p" + seed.toString(36) + Math.floor(rnd() * 1296).toString(36),
    name: pre.city + " · " + (os === "win" ? "Windows" : (os === "mac" ? "macOS" : "Linux")),
    preset: pre.id,
    city: pre.city,
    cc: pre.cc,
    os: os,
    seed: seed >>> 0,
    chrome: chromeV,
    ua: ADE_buildUA(os, chromeV),
    platform: platform,
    uaPlatform: uaPlatform,
    arch: os === "mac" ? "arm" : "x86",
    bitness: "64",
    model: "",
    mobile: false,
    platformVersion: pick(ADE_PV[os]),
    brandMajor: major,
    cores: hw[0],
    ram: hw[1],
    touch: touch,
    gpuVendor: gpu[0],
    gpuRenderer: gpu[1],
    screenW: scr[0],
    screenH: scr[1],
    dpr: dpr,
    depth: 24,
    tzName: pre.tz,
    tzStd: pre.std,
    tzDst: pre.dst,
    locale: pre.locale,
    langs: langs,
    acceptLang: acceptLang,
    lat: pre.lat,
    lon: pre.lon,
    acc: pre.acc,
    sampleRate: pick([44100, 44100, 48000]),
    battery: rnd() < 0.5
      ? { charging: true, level: 1, cTime: 0, dTime: Infinity }
      : { charging: false, level: Math.round((0.55 + rnd() * 0.4) * 100) / 100, cTime: Infinity, dTime: Math.round(2000 + rnd() * 20000) },
    fonts: ADE_FONTS[os].slice()
  };
}
