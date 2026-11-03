# Архітектура: AVR8js NeoPixels + FastLED Demo

Опис складений за вмістом файлів `index.html`, `package.json` і `src/*`.

## Що це

Браузерний застосунок, який виконує Arduino-скетч із FastLED на емульованому
ATmega328p ([avr8js](https://github.com/wokwi/avr8js)) і малює вихідний сигнал
WS2812/NeoPixel на елементі `<wokwi-neopixel-matrix>`. Користувач пише скетч у
редакторі Monaco й натискає Run.

Залежності: `avr8js`, `@wokwi/elements`, `lit-html`. Dev-залежність: `vite`.
Запуск: `yarn start` (Vite на порту 3000). Збірки, тестів і лінтера немає, Vite
лише транспілює TypeScript на льоту без перевірки типів.

## Загальний потік даних

```
скетч у Monaco
   │  Run
   ▼
compile.ts ──POST──► /api/compile (server/, arduino-cli) ──► { stdout, stderr, hex }
   │
   ▼
execute.ts: AVRRunner(hex)
   ├─ intelhex.ts: HEX → flash (Uint16Array)
   └─ CPU + timer0 + порти B/C/D + USART0 @ 16 МГц
   │
   │  цикл: avrInstruction + cpu.tick
   │
   ├─ зміна PORTD ──► index.ts ──► ws2812.ts (feedValue, пін 3, час у нс)
   ├─ байт USART ───► index.ts ──► панель Serial output
   └─ кожні 500 000 циклів ► колбек у index.ts:
         ├─ format-time.ts: «Simulation time: MM:SS.mmm»
         └─ ws2812.ts update() ► нові пікселі ► matrix.setPixel(...)
```

## Файли

### Корінь

| Файл | Призначення |
|---|---|
| `index.html` | Каркас сторінки. Матриця `<wokwi-neopixel-matrix cols="50" rows="1">`, панель кнопок (`#run-button`, `#stop-button` спочатку disabled, `#revert-button`, `#status-label`), контейнер `.code-editor`, дві панелі виводу (`#compiler-output-text`, `#serial-output-text`). Підключає модуль `./src/index.ts`. |
| `package.json` | Залежності та скрипт `start`. Версії Node і Yarn зафіксовано через Volta. |
| `demo_sketches/*.ino` | Приклади скетчів (`rainbow`, `rainbow_beat`, `pacifica`, `fadeTowardColor`). Застосунок їх не завантажує, їх копіюють у редактор вручну. |
| `CLAUDE.md` | Інструкції для Claude Code. |

### `src/`

| Файл | Призначення |
|---|---|
| `index.ts` | Точка входу, склеює UI з рештою модулів. Створює редактор Monaco (мова `cpp`, без мінімапи) з початковим текстом із `EditorHistoryUtil` або з `DEFAULT_CODE` (скетч `rainbow_beat`, 50 діодів, `DATA_PIN 3`). Містить обробники Run, Stop і Revert, функцію `executeProgram`, яка запускає емуляцію й оновлює матрицю. |
| `compile.ts` | `buildHex(source)` робить POST `{ sketch }` на `${VITE_API_URL ?? "/api"}/compile` (власний сервер у `server/`) і повертає JSON `{ stdout, stderr, hex }`. Мережеві помилки й не-2xx статуси кидають `CompileError`. Помилка компіляції приходить як відповідь без `hex`, а текст помилки лежить у `stderr`. |
| `intelhex.ts` | `loadHex(source, target)` розбирає Intel HEX. Обробляє лише записи даних (тип `00`), решту ігнорує. Байти пише за адресою запису в `Uint8Array`. |
| `execute.ts` | Клас `AVRRunner`. Flash — `Uint16Array(0x8000)`. Створює `CPU`, `AVRTimer` (timer0), `AVRIOPort` для B/C/D і `AVRUSART` (USART0), тактова частота 16 МГц. `execute(callback)` виконує інструкції в циклі. Коли `cpu.cycles % 500000 === 0`, викликає колбек і робить `await setTimeout(0)`. Тільки тут перевіряється прапорець `stopped`. `stop()` лише виставляє цей прапорець. |
| `ws2812.ts` | Клас `WS2812Controller(numPixels)`. Декодує протокол WS2812 з переходів піна, див. нижче. |
| `format-time.ts` | `formatTime(seconds)` повертає рядок `MM:SS.mmm`. Використовується для напису про симульований час. |
| `index.css` | Розмітка: ширина `.app-container` 800px, `.toolbar` (flex), `.pixels` (темний фон), `.code-editor` (висота 500px), `.compiler-output` (до 120px зі скролом), синій колір для `#serial-output-text`. |
| `utils/editor-history.util.ts` | Клас `EditorHistoryUtil` зі статичними методами `storeSnippet`, `clearSnippet`, `getValue` над `localStorage` (ключ `AVRJS8_EDITOR_HISTORY`). |

## Як працює додаток

### 1. Старт сторінки
`index.ts` імпортує Monaco з npm-пакета `monaco-editor`, задає
`self.MonacoEnvironment.getWorker` (воркер редактора через Vite `?worker`) і створює
редактор. Якщо в `localStorage` є збережений код, він завантажується, інакше
береться `DEFAULT_CODE`.

### 2. Run (`compileAndRun`)
1. Поточний код зберігається в `localStorage`.
2. Run і Revert вимикаються, панель Serial очищується, статус «Compiling...».
3. `buildHex` надсилає код на віддалений компілятор Wokwi. Локально нічого не
   компілюється, FastLED надає сам компілятор, тому потрібен інтернет.
4. У панель компілятора виводиться `stderr` або `stdout`.
5. Якщо `hex` є, вмикається Stop і викликається `executeProgram(hex)`. Якщо ні,
   знову вмикається Run. У разі винятку показується `alert`.

### 3. Емуляція (`executeProgram`)
- `AVRRunner` завантажує HEX у flash і створює периферію ATmega328p.
- `WS2812Controller` створюється на `matrix.cols * matrix.rows` пікселів,
  тобто кількість діодів береться з атрибутів у `index.html`.
- На `portD` вішається слухач. На будь-яку зміну порту він передає в
  контролер стан піна 3 і час у наносекундах
  (`cycles / 16 МГц * 1e9`).
- Байти з `usart.onByteTransmit` дописуються в панель Serial як символи.
- `runner.execute(...)` запускає цикл. На кожному колбеку (раз на 500 000
  циклів, це приблизно 31 мс симульованого часу) оновлюється напис
  «Simulation time» і зчитуються нові пікселі.

### 4. Декодування WS2812 (`ws2812.ts`)
Час — у симульованих наносекундах, тож результат не залежить від швидкості
реального браузера.
- Контролер реагує лише на зміну стану піна й рахує тривалість попереднього
  стану.
- Тривалість HIGH порівнюється з `ZERO_HIGH` (400 нс) і `ONE_HIGH` (800 нс) із
  допуском `MARGIN` (160 нс). Так ставиться кандидат `detectZero` або
  `detectOne`.
- Біт зараховується, коли наступний LOW достатньо довгий:
  `≥ ZERO_LOW - MARGIN` (850 нс) для нуля або `≥ ONE_LOW - MARGIN` (450 нс)
  для одиниці.
- 24 біти збираються в слово, старший біт першим, і записуються в
  `pixels[pixelIndex]`. Після заповнення всіх пікселів ставиться `overflow`,
  і далі імпульси ігноруються.
- LOW тривалістю `≥ 50 000 нс` (`RESET_TIME`) скидає стан, і наступний кадр
  починається з першого піксела.
- Останній біт кадру визначається окремо, бо після нього лінія може довго не
  змінювати стан. `checkLastBit` на спадному фронті при `bitIndex === 23`
  записує піксел із передбаченим значенням. `update()` дописує останній піксел,
  якщо біт нульовий і минуло достатньо часу.
- `update(cpuNanos)` повертає масив пікселів лише тоді, коли були зміни,
  інакше `null`.

### 5. Малювання
Колбек у `index.ts` проходить по рядках і стовпцях матриці й викликає
`matrix.setPixel(row, col, { r, g, b })` з компонентами в діапазоні 0..1.
Декодоване слово має порядок **GRB**: G у бітах 16–23, R у 8–15, B у 0–7.

### 6. Stop і Revert
- **Stop**: вмикає Run і Revert, вимикає Stop, викликає `runner.stop()`.
  Зупинка настає не одразу, а при наступному жорсткому виході з циклу
  (після найближчого `await setTimeout(0)`).
- **Revert**: підставляє `DEFAULT_CODE` у редактор і зберігає його в
  `localStorage`.

### 7. Збереження коду
Вміст редактора записується в `localStorage` лише при натисканні Run або
Revert. Правки, які не запускали, після перезавантаження пропадають.

## Жорстко закладені припущення

Ці речі змінюються лише разом:
- Пін даних — PORTD pin 3 (Arduino D3), тому в скетчах потрібно
  `#define DATA_PIN 3`.
- Кількість діодів визначається атрибутами `cols` і `rows` матриці в
  `index.html` (зараз 50 × 1). У `DEFAULT_CODE` `NUM_LEDS` теж 50.
- Порядок кольорів декодера — GRB, його розпаковує `index.ts`.
- Частота CPU 16 МГц зашита і в `execute.ts` (`MHZ`), і в `index.ts`
  (локальна константа `MHZ`).

## Відомі особливості

- Умова `cpu.cycles % 500000 === 0` у `execute.ts` вимагає точного збігу.
  Якщо інструкція займає кілька циклів і лічильник перестрибує кратне значення,
  колбек у цей раз не викличеться. Це випливає з коду, запуском не
  перевірялося.
- `buildHex` не перевіряє `resp.ok`, а лише розбирає JSON відповіді.
- Запуск вимагає мережі: компілятор Wokwi і шрифти завантажуються
  із зовнішніх хостів.
