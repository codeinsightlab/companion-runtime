import { execFile } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export interface MacCommandExecution {
  readonly result: Promise<string>;
  cancel(): void;
}

export type MacCommandRunner = (file: string, args: readonly string[]) => MacCommandExecution;

export const runMacCommand: MacCommandRunner = (file, args) => {
  let settled = false;
  let cancelRequested = false;
  let child: ChildProcess | undefined;
  const result = new Promise<string>((resolve, reject) => {
    child = execFile(
      file,
      [...args],
      { encoding: "utf8", maxBuffer: 1024 * 1024 },
      (error, stdout) => {
        settled = true;
        if (error) {
          const message = cancelRequested
            ? `macOS command cancelled: ${file}`
            : `macOS command failed: ${file}`;
          reject(new Error(message, { cause: error }));
          return;
        }
        resolve(stdout);
      }
    );
  });
  return {
    result,
    cancel: () => {
      if (settled || cancelRequested) return;
      cancelRequested = true;
      child?.kill();
    }
  };
};
