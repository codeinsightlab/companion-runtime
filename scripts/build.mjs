import { cpSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDirectory = resolve(projectRoot, "dist");
const typeScriptCompiler = resolve(projectRoot, "node_modules/typescript/bin/tsc");

rmSync(outputDirectory, { recursive: true, force: true });
execFileSync(process.execPath, [typeScriptCompiler, "-p", "tsconfig.build.json"], {
  cwd: projectRoot,
  stdio: "inherit"
});

cpSync(resolve(projectRoot, "packages/core/config"), resolve(outputDirectory, "packages/core/config"), {
  recursive: true
});
mkdirSync(resolve(outputDirectory, "packages/core/runtime"), { recursive: true });
cpSync(
  resolve(projectRoot, "packages/core/runtime/pet-runtime.css"),
  resolve(outputDirectory, "packages/core/runtime/pet-runtime.css")
);
cpSync(resolve(projectRoot, "characters"), resolve(outputDirectory, "characters"), { recursive: true });
cpSync(resolve(projectRoot, "examples"), resolve(outputDirectory, "examples"), { recursive: true });
mkdirSync(resolve(outputDirectory, "apps/desktop"), { recursive: true });
cpSync(
  resolve(projectRoot, "apps/desktop/index.html"),
  resolve(outputDirectory, "apps/desktop/index.html")
);
cpSync(
  resolve(projectRoot, "apps/desktop/desktop.css"),
  resolve(outputDirectory, "apps/desktop/desktop.css")
);
