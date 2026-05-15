import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const codeRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRoot = resolve(codeRoot, "..");

export type ScriptArgs = Record<string, string | boolean>;

export function loadLocalEnv(): void {
  for (const envPath of [resolve(projectRoot, ".env.local"), resolve(codeRoot, ".env.local")]) {
    if (!existsSync(envPath)) {
      continue;
    }

    const body = readFileSync(envPath, "utf8");
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) {
        continue;
      }

      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) {
        continue;
      }

      process.env[key] = stripQuotes(rawValue.trim());
    }
  }
}

export function parseArgs(argv = process.argv.slice(2)): ScriptArgs {
  const args: ScriptArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }

    const normalized = token.slice(2);
    const inline = normalized.indexOf("=");
    if (inline !== -1) {
      args[normalized.slice(0, inline)] = normalized.slice(inline + 1);
      continue;
    }

    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[normalized] = next;
      i++;
    } else {
      args[normalized] = true;
    }
  }

  return args;
}

export function argString(args: ScriptArgs, key: string, fallback?: string): string | undefined {
  const value = args[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return fallback;
}

export function argInt(args: ScriptArgs, key: string, fallback: number): number {
  const value = argString(args, key);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid --${key}: ${value}`);
  }
  return parsed;
}

export function argBool(args: ScriptArgs, key: string, fallback = false): boolean {
  const value = args[key];
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

