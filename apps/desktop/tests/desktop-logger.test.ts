import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DesktopFileLogger, isDesktopLogEntry } from "../src/logging/DesktopLogger.js";

test("DesktopFileLogger writes structured levels and redacts secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "companion-logger-"));
  try {
    const logger = new DesktopFileLogger({ directory });
    logger.info("application.startup", { mode: "production" });
    logger.warn("listener.warning", { detail: "token=private-value" });
    logger.error("application.error", { message: "failed" });
    const contents = await readFile(logger.filePath, "utf8");
    assert.match(contents, /"level":"INFO"/);
    assert.match(contents, /"level":"WARN"/);
    assert.match(contents, /"level":"ERROR"/);
    assert.doesNotMatch(contents, /private-value/);
    assert.match(contents, /token=\[REDACTED\]/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("DesktopFileLogger rolls files when the size limit is reached", async () => {
  const directory = await mkdtemp(join(tmpdir(), "companion-logger-roll-"));
  try {
    const logger = new DesktopFileLogger({ directory, maxFileBytes: 180, maxFiles: 3 });
    for (let index = 0; index < 8; index += 1) logger.info("window.activity", { index, value: "x".repeat(50) });
    const files = await readdir(directory);
    assert.ok(files.includes("companion.log"));
    assert.ok(files.includes("companion.log.1"));
    assert.ok(files.length <= 3);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Renderer log IPC accepts only bounded structured entries", () => {
  assert.equal(isDesktopLogEntry({ level: "INFO", event: "behavior.transition", context: { slot: "SUCCESS" } }), true);
  assert.equal(isDesktopLogEntry({ level: "DEBUG", event: "behavior.transition" }), false);
  assert.equal(isDesktopLogEntry({ level: "INFO", event: "x", context: { payload: { private: true } } }), false);
});

test("DesktopFileLogger removes expired rolled logs on startup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "companion-logger-retention-"));
  try {
    const expired = join(directory, "companion.log.1");
    await writeFile(expired, "old\n", "utf8");
    await utimes(expired, new Date("2025-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"));
    new DesktopFileLogger({ directory, retentionDays: 1, now: () => new Date("2026-08-03T00:00:00Z") });
    assert.equal((await readdir(directory)).includes("companion.log.1"), false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
