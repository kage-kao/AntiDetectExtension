# AntiDetectExtension v2.0.0 — чистые исходники

Глубокий апгрейд v1.3.0: все сигналы фингерпринта сведены в одну согласованную легенду.

## Что нового против v1.3.0

| Сигнал | v1.3.0 | v2 |
|---|---|---|
| Canvas / WebGL / Audio | per-visit шум, новое при каждой загрузке | шум с сидом легенды — стабилен, пока держится образ |
| WebGL | vendor/renderer по ОС | + фолбэк `WEBGL_debug_renderer_info`, согласован с UA и Client Hints |
| Navigator | случайные CPU/RAM | легенда: UA, platform, CPU, RAM, touch, язык — всё из одного образа |
| Client Hints | только platformVersion | полный набор: brands, fullVersionList, arch, bitness, model, uaFullVersion + HTTP-заголовки (UA, Sec-CH-UA, Accept-Language) через DNR |
| Язык/локаль | не трогалось | navigator.language(s), Intl.DateTimeFormat/NumberFormat, toLocale* — из легенды; явный выбор сайта (de-DE и т.п.) не перебивается |
| Часовой пояс | статический offset на загрузку | DST-правила US/EU/AU + getFullYear/getMonth/…/toString/toTimeString из зоны легенды |
| Геолокация | не было | координаты города легенды с GPS-джиттером, permissions.query → granted (группа geo, ВЫКЛ по умолчанию) |
| Экран | случайное ≥ окна | легенда + availLeft/Top, colorDepth, pixelDepth, DPR, orientation |
| Шрифты | масштаб метрик | + document.fonts.check() пропускает только шрифты ОС легенды |
| Audio | шум буфера | + sampleRate легенды (44100/48000) |
| Battery | всегда reject | правдоподобный BatteryManager из легенды (не так подозрительно) |
| Профили | нет | генератор: 9 городов × 3 ОС, имя/мета в popup, режим stable / per-visit |

## Установка (Chrome / Edge / Brave)

1. Распакуй `AntiDetectExtension_v2.0.0.zip`
2. Открой `chrome://extensions`, включи **Developer mode**
3. **Load unpacked** → выбери папку `AntiDetectExtension`
4. Открой popup → выбери страну и систему, нажми «Новый образ»

## Как устроена легенда

- Один сид → один образ: GPU, экран, CPU/RAM, язык, часовой пояс, координаты.
- Stable-режим (по умолчанию): образ держится, пока не нажмёшь «Новый образ».
- Per-visit: поведение v1 — новые значения при каждой загрузке (несогласованные).
- Первая загрузка после установки: образ создаётся автоматически (Berlin · Windows).

## Честные границы (важно)

Расширение **не может** менять: IP-адрес, сетевой отпечаток (TLS/JA3), DNS, реальное
местоположение по IP. К образу **обязательно нужен подходящий прокси/VPN**
(страна прокси = страна образа), иначе связка «IP другой страны + локальные
сигналы образа» сама станет детект-сигналом. Группы **geo** и **timezone**
по умолчанию ВЫКЛЮЧЕНЫ — включай только под matching IP.

## Проверка

- CreepJS: https://abrahamjuliot.github.io/creepjs/
- BrowserLeaks: https://browserleaks.com/javascript (и Canvas, WebGL, Fonts, WebRTC, TLS)
- Pixelscan: https://pixelscan.net/
- Ожидаемо: стабильные значения между перезагрузками в stable-режиме,
  `navigator.webdriver === false`, WebRTC без реальных IP, `document.fonts.check`
  видит только шрифты своей ОС, timezone/гео совпадают с городом образа.

## Структура

```
manifest.json          MV3, Chrome 119+
background.js          SW: профили, DNR-заголовки, MAIN-регистрация, forget-sites
common.js              дефолты + storage-хелперы
profiles.js            генератор легенд (чистый JS, без chrome API)
content/bridge.js      ISOLATED-мост + localStorage-зеркало + косметика
content/flags/*.js     флаги групп (динамический MAIN-набор)
content/inject.js      MAIN-хуки фингерпринта (~1100 строк)
popup.* / options.*    UI (RU/EN), генератор профилей
rules/                 EasyList / EasyPrivacy DNR
icons/                 иконки v1
```

## Заливка через tmps.site (curl)

```bash
cd /путь/к/папке-с-исходниками
zip -r AntiDetectExtension_v2.0.0.zip AntiDetectExtension -x "*/.DS_Store"
curl -X POST -F "file=@AntiDetectExtension_v2.0.0.zip" -F "duration=7" https://tmps.site/upload
```

В ответ придёт JSON со ссылкой вида `https://tmps.site/XXXX/...zip`.
Параметр `duration` — дни хранения (7 = неделя).
