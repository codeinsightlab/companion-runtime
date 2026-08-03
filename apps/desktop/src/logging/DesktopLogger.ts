import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync
} from "node:fs";
import { basename, join } from "node:path";

export const DESKTOP_LOG_LEVELS = ["INFO", "WARN", "ERROR"] as const;
export type DesktopLogLevel = typeof DESKTOP_LOG_LEVELS[number];
export type DesktopLogContext = Readonly<Record<string, string | number | boolean | null | undefined>>;

export interface DesktopLogEntry {
  readonly level: DesktopLogLevel;
  readonly event: string;
  readonly context?: DesktopLogContext;
}

export interface DesktopLoggerLike {
  info(event: string, context?: DesktopLogContext): void;
  warn(event: string, context?: DesktopLogContext): void;
  error(event: string, context?: DesktopLogContext): void;
}

export interface DesktopFileLoggerOptions {
  readonly directory: string;
  readonly maxFileBytes?: number;
  readonly maxFiles?: number;
  readonly retentionDays?: number;
  readonly now?: () => Date;
}

const LOG_FILE_NAME = "companion.log";

export class DesktopFileLogger implements DesktopLoggerLike {
  readonly #directory: string;
  readonly #filePath: string;
  readonly #maxFileBytes: number;
  readonly #maxFiles: number;
  readonly #retentionMs: number;
  readonly #now: () => Date;

  constructor({
    directory,
    maxFileBytes = 2 * 1024 * 1024,
    maxFiles = 5,
    retentionDays = 14,
    now = () => new Date()
  }: DesktopFileLoggerOptions) {
    if (!directory.trim()) throw new TypeError("Desktop log directory must be non-empty");
    if (maxFileBytes <= 0 || maxFiles < 1 || retentionDays < 1) {
      throw new RangeError("Invalid Desktop log retention configuration");
    }
    this.#directory = directory;
    this.#filePath = join(directory, LOG_FILE_NAME);
    this.#maxFileBytes = maxFileBytes;
    this.#maxFiles = maxFiles;
    this.#retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    this.#now = now;
    mkdirSync(directory, { recursive: true });
    this.#cleanupExpired();
  }

  get filePath(): string {
    return this.#filePath;
  }

  info(event: string, context?: DesktopLogContext): void { this.#write("INFO", event, context); }
  warn(event: string, context?: DesktopLogContext): void { this.#write("WARN", event, context); }
  error(event: string, context?: DesktopLogContext): void { this.#write("ERROR", event, context); }

  #write(level: DesktopLogLevel, event: string, context?: DesktopLogContext): void {
    const timestamp = this.#now().toISOString();
    const safeEvent = this.#safeText(event, 120);
    const safeContext = context ? Object.fromEntries(
      Object.entries(context)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [this.#safeText(key, 48), typeof value === "string"
          ? this.#safeText(value, 240)
          : value])
    ) : undefined;
    const line = `${JSON.stringify({ timestamp, level, event: safeEvent, ...(safeContext ? { context: safeContext } : {}) })}\n`;
    this.#rotateIfNeeded(Buffer.byteLength(line));
    appendFileSync(this.#filePath, line, { encoding: "utf8", mode: 0o600 });
  }

  #rotateIfNeeded(incomingBytes: number): void {
    if (!existsSync(this.#filePath) || statSync(this.#filePath).size + incomingBytes <= this.#maxFileBytes) return;
    const oldest = join(this.#directory, `${LOG_FILE_NAME}.${this.#maxFiles - 1}`);
    if (existsSync(oldest)) unlinkSync(oldest);
    for (let index = this.#maxFiles - 2; index >= 1; index -= 1) {
      const source = join(this.#directory, `${LOG_FILE_NAME}.${index}`);
      if (existsSync(source)) renameSync(source, join(this.#directory, `${LOG_FILE_NAME}.${index + 1}`));
    }
    renameSync(this.#filePath, join(this.#directory, `${LOG_FILE_NAME}.1`));
  }

  #cleanupExpired(): void {
    const cutoff = this.#now().getTime() - this.#retentionMs;
    for (const name of readdirSync(this.#directory)) {
      if (!name.startsWith(LOG_FILE_NAME)) continue;
      const path = join(this.#directory, basename(name));
      if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
    }
  }

  #safeText(value: string, maxLength: number): string {
    return value
      .replace(/(token|authorization|password|secret)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, maxLength);
  }
}

export function isDesktopLogEntry(value: unknown): value is DesktopLogEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DesktopLogEntry>;
  return DESKTOP_LOG_LEVELS.includes(candidate.level as DesktopLogLevel)
    && typeof candidate.event === "string"
    && candidate.event.length > 0
    && candidate.event.length <= 120
    && (candidate.context === undefined || (
      typeof candidate.context === "object"
      && candidate.context !== null
      && !Array.isArray(candidate.context)
      && Object.keys(candidate.context).length <= 12
      && Object.values(candidate.context).every((item) =>
        item === undefined || item === null || ["string", "number", "boolean"].includes(typeof item))
    ));
}
