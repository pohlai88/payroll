/**
 * @feature shell
 * @layer spine
 *
 * Load `.env.local` into `process.env` when present.
 *
 * Existing process env wins (shell / CI exports are not overwritten). Missing
 * file is a no-op so Docker/CI can keep injecting vars without a local file.
 */

import fs from "node:fs";
import path from "node:path";

const NEWLINE = /\r?\n/;

export interface ParsedEnvLine {
  readonly key: string;
  readonly value: string;
}

/**
 * Parse dotenv-style lines. Supports optional single/double quotes; ignores
 * blanks and `#` comments. Does not expand `${VAR}` interpolations.
 */
export function parseEnvFile(text: string): ParsedEnvLine[] {
  const out: ParsedEnvLine[] = [];
  for (const raw of text.split(NEWLINE)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (key.length === 0) {
      continue;
    }
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out.push({ key, value });
  }
  return out;
}

export function applyEnvLines(
  lines: readonly ParsedEnvLine[],
  env: NodeJS.ProcessEnv = process.env
): void {
  for (const { key, value } of lines) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }
}

export function loadEnvLocal(
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const filePath = path.join(cwd, ".env.local");
  if (!fs.existsSync(filePath)) {
    return false;
  }
  const text = fs.readFileSync(filePath, "utf8");
  applyEnvLines(parseEnvFile(text), env);
  return true;
}
