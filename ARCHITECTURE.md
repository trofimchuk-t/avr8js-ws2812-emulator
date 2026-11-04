# Архітектура: AVR8js NeoPixels + FastLED Demo

Опис складений за вмістом файлів репозиторію (`package.json`, `packages/*`, `Dockerfile`,
`scripts/`). Станом на завершену фазу 2 з `PLAN.md`.

## Що це

Застосунок, який виконує Arduino-скетч із FastLED на емульованому ATmega328p
([avr8js](https://github.com/wokwi/avr8js)) і малює вихідний сигнал WS2812/NeoPixel на
елементі `<wokwi-neopixel-matrix>`. Користувач пише скетч у редакторі Monaco й натискає Run.
Скетч компілює локальний сервер через `arduino-cli`, емуляція працює в браузері.

## Монорепо

Yarn 1 workspaces, Node 24 і Yarn зафіксовано через Volta (у кожному пакеті є
`volta.extends`, щоб Node 24 діяв і всередині `packages/*`).

| Пакет | Призначення |
|---|---|
| `packages/engine` (`@avr8js-ws2812/engine`) | Рушій без DOM: CPU, декодер WS2812, `createSimulation`. Працює в браузері й у Node. |
| `packages/web` (`@avr8js-ws2812/web`) | Фронтенд на Vite: редактор, кнопки, матриця, панелі виводу. |
| `packages/server` (`@avr8js-ws2812/server`) | Fastify-сервер компіляції. |

Корінь: `tsconfig.base.json` (спільні опції), `eslint.config.js`, `.prettierrc.json`,
`scripts/update-golden.ts`, `demo_sketches/*.ino`, `Dockerfile`.

Запуск: `yarn server` (порт 3001) і `yarn start` (Vite, порт 3000, проксує `/api` на сервер).
Перевірки: `yarn run check` (typecheck у кожному пакеті, ESLint, Prettier, Vitest). Звичайний
`yarn check` викликає вбудовану команду Yarn, тому потрібен саме `yarn run`.

## Загальний потік даних

```
скетч у Monaco
   │  Run
   ▼
web/compile.ts ──POST──► /api/compile (packages/server, arduino-cli) ──► { stdout, stderr, hex }
   │
   ▼
engine: createSimulation({ hex, led, onFrame, onSerial, onProgress })
   ├─ intelhex.ts: HEX → flash (Uint16Array)
   ├─ execute.ts (AVRRunner): CPU + timer0 + порти B/C/D + USART0 @ 16 МГц
   ├─ слухач PORTD, біт 3 ──► ws2812.ts (feedValue, час у нс)
   └─ цикл по 500 000 циклів: update() ► onFrame(пікселі), onProgress(нс), yield setTimeout
   │
   ▼
web/index.ts: onFrame ► matrix.setPixel(...), onSerial ► панель Serial, onProgress ► статус
```

## `packages/engine`

Конфіг `tsconfig.json` без DOM-бібліотеки, тому `window` і `document` недоступні. Лише erasable-синтаксис
TypeScript, щоб Node міг запускати файли напряму (параметри-властивості класів не
використовуються).

| Файл | Призначення |
|---|---|
| `src/index.ts` | Публічні експорти: `createSimulation`, `cyclesToNanos`, типи, `AVRRunner`, `WS2812Controller`, `loadHex`, `formatTime`. |
| `src/simulation.ts` | `createSimulation(options): Simulation`. Створює `AVRRunner` і `WS2812Controller(led.count)`, підписується на порт піна `led.dataPin` (PORTB або PORTD) і на `usart.onByteTransmit`, переводить слова з порядку `led.colorOrder` у GRB, веде цикл виконання. |
| `src/led-config.ts` | `LedConfig`, `DEFAULT_LED_CONFIG`, `createLedConfig`, `ColorOrder`, `wireToGrb`. |
| `src/pins.ts` | `arduinoPinToPort(pin)`: D2..D7 → PORTD біти 2..7, D8..D13 → PORTB біти 0..5. |
| `src/sketch-config.ts` | `parseSketchConfig(source)` → `{ config, found, warnings }`: читає `FastLED.addLeds<CHIP, PIN[, ORDER]>(leds, N)`, розкриваючи `#define` і `const` та цілочисельні вирази. Те, що не вдалося визначити, береться з `DEFAULT_LED_CONFIG` із попередженням. |
| `src/execute.ts` | `AVRRunner`: flash `Uint16Array(0x8000)`, `CPU`, `AVRTimer` (timer0), `AVRIOPort` B/C/D, `AVRUSART` (USART0), `CPU_HZ = 16e6`. Власного циклу немає: лише `step()` (одна інструкція) і `runUntil(cycles)`. |
| `src/ws2812.ts` | `WS2812Controller(numPixels)`, декодер протоколу, див. нижче. |
| `src/intelhex.ts` | `loadHex(source, target)`: розбирає лише записи даних (тип `00`). |
| `src/format-time.ts` | `formatTime(seconds)` → `MM:SS.mmm`. |
| `test/golden.ts`, `test/golden.test.ts`, `test/fixtures/` | Golden-тести, див. нижче. |
| `src/*.test.ts` | Юніт-тести декодера (`ws2812.test.ts`) і `Simulation` (`simulation.test.ts`). |

### API `Simulation`

```ts
createSimulation({ hex, led: LedConfig, onFrame, onSerial, onProgress }): Simulation
// Simulation: state, nanos, start(), pause(), stop(), step(cycles = 1), setSpeed(x)
```

- `onFrame(pixels, nanos)`: копія масиву `Uint32Array`, слова **GRB** незалежно від
  `led.colorOrder` (G у бітах 16–23, R у 8–15, B у 0–7). Викликається лише коли декодер має зміни.
- `onSerial(char)`: кожен байт USART як односимвольний рядок.
- `onProgress(nanos)`: приблизно раз на 31 мс симульованого часу.
- `start()` запускає або поновлює після `pause()`. `pause()` зупиняє на найближчому
  yield і зберігає стан. `stop()` остаточний: для нового запуску створюється нова симуляція.
  Токен `runId` не дає застарілому циклу жити після pause → start.
- `step(cycles)` синхронно виконує щонайменше стільки циклів і повідомляє кадр. Дозволений
  лише поза `running`. Використовується в тестах і для покрокового виконання.
- `setSpeed(x)`: цільова швидкість у кратності реального часу. За замовчуванням `Infinity`
  (без обмеження, як було раніше). `1` дає реальний час 16 МГц. Хост може не встигати.
- Цикл: кожні 500 000 циклів перевіряє кадр, викликає `onProgress` і віддає керування
  через `setTimeout` (0 мс або затримка пейсингу). Лише в цій точці діють `pause()` і `stop()`.
- Час: `cyclesToNanos(cycles) = round(cycles / 16e6 * 1e9)`.

### Декодування WS2812 (`ws2812.ts`)

Час — у симульованих наносекундах, тож результат не залежить від швидкості браузера.
- Контролер реагує лише на зміну стану піна й рахує тривалість попереднього стану.
- Тривалість HIGH порівнюється з `ZERO_HIGH` (400 нс) і `ONE_HIGH` (800 нс) із допуском
  `MARGIN` (160 нс). Так ставиться кандидат `detectZero` або `detectOne`.
- Біт зараховується, коли наступний LOW достатньо довгий: `≥ ZERO_LOW - MARGIN` (850 нс) для
  нуля або `≥ ONE_LOW - MARGIN` (450 нс) для одиниці.
- 24 біти збираються в слово, старший біт першим. Після заповнення всіх пікселів
  ставиться `overflow`, і далі імпульси ігноруються.
- LOW тривалістю `≥ 50 000 нс` (`RESET_TIME`) скидає стан, наступний кадр починається з
  першого піксела.
- Останній біт кадру визначається окремо, бо після нього лінія може довго не змінювати
  стан: `checkLastBit` на спадному фронті при `bitIndex === 23` і `update()`.
- `update(cpuNanos)` повертає масив пікселів лише при змінах, інакше `null`.

### Golden-тести

`test/fixtures/` містить HEX-файли, зібрані з `demo_sketches/*.ino` закріпленим тулчейном, і
`golden.json`: хеші (префікс sha256) останнього кадру в моменти 100, 500, 1000 і 2000 мс
симульованого часу та вивід Serial. `golden.test.ts` проганяє HEX у Node без браузера
через `Simulation.step` кроками по 1 мс (крок входить у golden, бо перевірка кадру робиться
раз на крок). Хеші записані самим рушієм, тому вони ловлять регресії, але не доводять
правильність кадрів. Після свідомої зміни тулчейна чи декодера: `yarn golden:update`
(потрібен `arduino-cli`), потім переглянути diff.

## `packages/web`

| Файл | Призначення |
|---|---|
| `index.html` | Каркас: `<wokwi-neopixel-matrix cols="50" rows="1">`, кнопки `#run-button`, `#stop-button` (спочатку disabled), `#revert-button`, `#status-label`, `.code-editor`, панелі `#compiler-output-text` і `#serial-output-text`. |
| `vite.config.ts` | Dev-проксі `/api` на `API_PROXY_TARGET` або `http://127.0.0.1:3001`. |
| `src/index.ts` | Створює Monaco (мова `cpp`, без мінімапи; воркер через Vite `?worker`), обробники Run/Stop/Revert, `executeProgram` створює `Simulation` і розпаковує GRB у `matrix.setPixel`. Кількість діодів = `matrix.cols * matrix.rows`. |
| `src/compile.ts` | `buildHex(source)`: POST `{ sketch }` на `${VITE_API_URL ?? "/api"}/compile`. Мережеві помилки й не-2xx кидають `CompileError`, UI показує їх у панелі компілятора. Помилка компіляції приходить як 200 без `hex`, текст у `stderr`. |
| `src/utils/editor-history.util.ts` | `EditorHistoryUtil` над `localStorage` (ключ `AVRJS8_EDITOR_HISTORY`). |
| `src/index.css` | Розмітка сторінки. |

Сценарії:
- **Run**: код зберігається в `localStorage`, Run і Revert вимикаються, панель Serial
  очищується, `buildHex`, вивід у панель компілятора; якщо є `hex`, вмикається Stop і
  створюється та стартує `Simulation`; інакше кнопки повертаються.
- **Stop**: `simulation.stop()`, вмикаються Run і Revert.
- **Revert**: підставляє `DEFAULT_CODE` (скетч `rainbow_beat`) і зберігає його.
- Код у `localStorage` пишеться лише при Run і Revert, невиконані правки втрачаються.

## `packages/server`

Fastify, запуск `yarn server` (`node main.ts`, Node виконує `.ts` напряму).

| Файл | Призначення |
|---|---|
| `main.ts` | Читає конфіг, перевіряє тулчейн (`verifyToolchain`), слухає `HOST`/`PORT` (за замовчуванням `127.0.0.1:3001`). |
| `app.ts` | `POST /api/compile` (`{ sketch }` → `{ stdout, stderr, hex }`), `GET /api/health`. Помилки: 400 (порожній `sketch`), 413 (завеликий), 503 з `Retry-After` (черга повна). |
| `compiler.ts` | `Compiler`: `arduino-cli compile` через `execFile` (масив аргументів, без shell) у тимчасовому каталозі, який видаляється після збірки. Кеш за sha256(тулчейн + скетч), спільні збірки для однакових запитів, чистка тимчасових шляхів у виводі. Помилка компіляції — відповідь 200 з порожнім `hex`. |
| `config.ts` | Закріплений тулчейн (`arduino:avr:uno`, ядро `arduino:avr@1.8.8`, FastLED 3.6.0) і ліміти з env: `MAX_SKETCH_BYTES`, `BUILD_TIMEOUT_MS`, `MAX_CONCURRENT_BUILDS`, `MAX_QUEUED_BUILDS`, `CACHE_ENTRIES`, `ARDUINO_CLI`. |
| `semaphore.ts` | `BuildQueue` з обмеженою чергою, `QueueFullError`. |
| `server.test.ts` | Тести черги, компілятора, HTTP-шару; тест із реальним `arduino-cli` пропускається, якщо CLI немає. |

Версія FastLED закріплена, бо від неї залежать таймінги, під які налаштовано `MARGIN`.
`Dockerfile` збирає той самий тулчейн; сервер не стартує при розбіжності версій.

## Жорстко закладені припущення

Конфігурація діодів (пін, кількість, порядок кольорів) більше не зашита: застосунок
розбирає скетч через `parseSketchConfig` при кожному Run і передає `LedConfig` у
`createSimulation`; матриця отримує розміри з нього (`applyLayout` у `packages/web/src/index.ts`).
Лишається закладеним:
- Підтримані піни D2..D13 (ATmega328p / Uno), тип мікросхеми лише `WS2812B`.
- Розкладка з розбору скетча завжди `strip` (`cols = count`, `rows = 1`).
- Частота CPU 16 МГц: `CPU_HZ` в `execute.ts`.

## Відомі особливості

- Швидкість за замовчуванням не обмежена: анімація йде швидше за реальний час, якщо хост
  достатньо швидкий. `setSpeed(1)` дає реальний час, але UI його поки не викликає.
- Вивід Serial іде повільно (115200 бод, переривання вимкнені під час `FastLED.show()`),
  тому рядок з `rainbow.ino` з'являється не одразу.
- `stop()` діє лише на межі кроку (приблизно 31 мс симульованого часу).
- Шрифт Roboto завантажується із Google Fonts; решта працює офлайн, окрім сервера
  компіляції, який має працювати локально.
