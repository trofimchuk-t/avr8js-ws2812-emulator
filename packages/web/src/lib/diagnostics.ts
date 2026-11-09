export type Severity = "error" | "warning";

export interface Diagnostic {
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based; gcc omits it for some messages. */
  column?: number;
  severity: Severity;
  message: string;
  /** Index of the line in the compiler output it came from. */
  outputLine: number;
}

// `file.ino:12:5: error: message` (column optional). Notes are context for the line above, not
// diagnostics of their own.
const PATTERN = /^([A-Za-z0-9_.-]+):(\d+):(?:(\d+):)?\s*(fatal error|error|warning):\s*(.*)$/;

/**
 * Reads gcc diagnostics from compiler output. Only files of the sketch count (`files`), so lines
 * about library or core sources are left as plain text.
 */
export function parseDiagnostics(output: string, files: readonly string[]): Diagnostic[] {
  const known = new Set(files);
  const result: Diagnostic[] = [];
  output.split("\n").forEach((text, outputLine) => {
    const match = PATTERN.exec(text.trimEnd());
    if (!match || !known.has(match[1])) return;
    result.push({
      file: match[1],
      line: Number(match[2]),
      column: match[3] ? Number(match[3]) : undefined,
      severity: match[4] === "warning" ? "warning" : "error",
      message: match[5],
      outputLine,
    });
  });
  return result;
}
