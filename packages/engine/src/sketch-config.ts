import {
  createLedConfig,
  DEFAULT_LED_CONFIG,
  isColorOrder,
  MAX_LEDS,
  type ColorOrder,
  type LedConfig,
} from "./led-config.ts";
import { MAX_DATA_PIN, MIN_DATA_PIN } from "./pins.ts";

/** One-wire chips the decoder understands, with FastLED's default color order for each. */
const CHIP_DEFAULT_ORDER: Record<string, ColorOrder> = {
  NEOPIXEL: "GRB",
  WS2812: "GRB",
  WS2812B: "GRB",
  WS2813: "GRB",
  WS2852: "GRB",
  WS2811: "RGB",
  WS2811_400: "RGB",
  SK6812: "GRB",
  UCS1903: "RGB",
};

export interface SketchConfigResult {
  config: LedConfig;
  /** Which values were read from the sketch; the others fell back to the defaults. */
  found: { count: boolean; dataPin: boolean; colorOrder: boolean };
  /** Human-readable notes about values that could not be determined or are unsupported. */
  warnings: string[];
}

/**
 * Derives a `LedConfig` from sketch text by reading the `FastLED.addLeds<CHIP, PIN[, ORDER]>(leds, N)`
 * call and resolving `#define` and `const` values it refers to (including simple integer
 * arithmetic). Anything it cannot resolve falls back to the defaults and adds a warning.
 */
export function parseSketchConfig(source: string): SketchConfigResult {
  const code = stripComments(source);
  const symbols = collectSymbols(code);
  const warnings: string[] = [];
  const found = { count: false, dataPin: false, colorOrder: false };
  const config = createLedConfig();

  const calls = [...code.matchAll(/\baddLeds\s*<([^<>]*)>\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)];
  if (calls.length === 0) {
    warnings.push("No FastLED.addLeds<...>() call found; using the default LED configuration.");
    return { config, found, warnings };
  }
  if (calls.length > 1) {
    warnings.push("Several addLeds() calls found; only the first strip is emulated.");
  }
  const templateArgs = splitArgs(calls[0][1]);
  const callArgs = splitArgs(calls[0][2]);

  const chip = templateArgs[0] ?? "";
  const defaultOrder = CHIP_DEFAULT_ORDER[chip];
  if (!defaultOrder) {
    warnings.push(`Chip "${chip}" is not a supported one-wire LED chip; using the defaults.`);
    return { config, found, warnings };
  }
  config.colorOrder = defaultOrder;

  const pin = evaluate(templateArgs[1], symbols);
  if (pin === undefined) {
    warnings.push(`Could not determine the data pin from "${templateArgs[1] ?? ""}".`);
  } else if (!Number.isInteger(pin) || pin < MIN_DATA_PIN || pin > MAX_DATA_PIN) {
    warnings.push(`Data pin ${pin} is not supported; use D${MIN_DATA_PIN}..D${MAX_DATA_PIN}.`);
  } else {
    config.dataPin = pin;
    found.dataPin = true;
  }

  if (templateArgs.length > 2) {
    const name = resolveName(templateArgs[2], symbols);
    if (name !== undefined && isColorOrder(name)) {
      config.colorOrder = name;
      found.colorOrder = true;
    } else {
      warnings.push(`Could not determine the color order from "${templateArgs[2]}".`);
    }
  } else {
    found.colorOrder = true;
  }

  const countExpr = callArgs.length >= 2 ? callArgs[callArgs.length - 1] : crgbArraySize(code);
  const count = evaluate(countExpr, symbols);
  if (count === undefined) {
    warnings.push(`Could not determine the number of LEDs from "${countExpr ?? ""}".`);
  } else if (!Number.isInteger(count) || count < 1 || count > MAX_LEDS) {
    warnings.push(`LED count ${count} is out of range (1..${MAX_LEDS}).`);
  } else {
    config.count = count;
    found.count = true;
  }

  if (!found.count) config.count = DEFAULT_LED_CONFIG.count;
  if (!found.dataPin) config.dataPin = DEFAULT_LED_CONFIG.dataPin;
  return { config, found, warnings };
}

function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ");
}

function collectSymbols(code: string) {
  const symbols = new Map<string, string>();
  for (const m of code.matchAll(/^[ \t]*#[ \t]*define[ \t]+(\w+)[ \t]+(.+)$/gm)) {
    symbols.set(m[1], m[2].trim());
  }
  const constRe =
    /\b(?:static\s+)?(?:constexpr|const)\s+(?:unsigned\s+)?(?:u?int(?:8|16|32)?(?:_t)?|byte|long|short)\s+(\w+)\s*=\s*([^;]+);/g;
  for (const m of code.matchAll(constRe)) symbols.set(m[1], m[2].trim());
  return symbols;
}

function crgbArraySize(code: string) {
  return /\bCRGBArray\s*<([^<>]+)>/.exec(code)?.[1];
}

/** Splits on top-level commas. */
function splitArgs(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(" || ch === "<") depth++;
    else if (ch === ")" || ch === ">") depth--;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() || args.length) args.push(current.trim());
  return args;
}

/** Follows `#define A B` chains until a non-symbol is reached. */
function resolveName(name: string, symbols: Map<string, string>): string | undefined {
  let current = name.trim();
  for (let i = 0; i < 16; i++) {
    const next = symbols.get(current);
    if (next === undefined) return current;
    current = next.trim();
  }
  return undefined;
}

/** Evaluates an integer expression (+ - * / % and parentheses) with symbols substituted. */
function evaluate(expr: string | undefined, symbols: Map<string, string>): number | undefined {
  if (expr === undefined) return undefined;
  try {
    return new ExprParser(expr, symbols, 0).parse();
  } catch {
    return undefined;
  }
}

class ExprParser {
  private pos = 0;
  private readonly tokens: string[];
  private readonly symbols: Map<string, string>;
  private readonly depth: number;

  constructor(text: string, symbols: Map<string, string>, depth: number) {
    this.symbols = symbols;
    this.depth = depth;
    if (depth > 16) throw new Error("symbol nesting too deep");
    this.tokens =
      text.match(/0[xX][0-9a-fA-F]+[uUlL]*|\d+[uUlL]*|[A-Za-z_]\w*|[()+\-*/%]|\S/g) ?? [];
  }

  parse(): number {
    const value = this.additive();
    if (this.pos !== this.tokens.length) throw new Error("unexpected token");
    return value;
  }

  private additive(): number {
    let value = this.multiplicative();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.tokens[this.pos++];
      const rhs = this.multiplicative();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }

  private multiplicative(): number {
    let value = this.unary();
    while (this.peek() === "*" || this.peek() === "/" || this.peek() === "%") {
      const op = this.tokens[this.pos++];
      const rhs = this.unary();
      if (op === "*") value *= rhs;
      else if (rhs === 0) throw new Error("division by zero");
      else value = op === "/" ? Math.trunc(value / rhs) : value % rhs;
    }
    return value;
  }

  private unary(): number {
    if (this.peek() === "-") {
      this.pos++;
      return -this.unary();
    }
    if (this.peek() === "+") {
      this.pos++;
      return this.unary();
    }
    return this.primary();
  }

  private primary(): number {
    const token = this.tokens[this.pos++];
    if (token === undefined) throw new Error("unexpected end");
    if (token === "(") {
      const value = this.additive();
      if (this.tokens[this.pos++] !== ")") throw new Error("missing )");
      return value;
    }
    if (/^\d/.test(token)) return Number(token.replace(/[uUlL]+$/, ""));
    if (/^[A-Za-z_]/.test(token)) {
      const body = this.symbols.get(token);
      if (body === undefined) throw new Error(`unknown symbol ${token}`);
      return new ExprParser(body, this.symbols, this.depth + 1).parse();
    }
    throw new Error(`unexpected token ${token}`);
  }

  private peek() {
    return this.tokens[this.pos];
  }
}
