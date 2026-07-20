import { app } from "electron";
import { createDesktopLifecycleManager } from "./lifecycle/createDesktopLifecycleManager.js";
import type { DesktopMode } from "./window.js";
import { acquireSingleInstanceLock } from "./lifecycle/singleInstance.js";

const hasSingleInstanceLock = acquireSingleInstanceLock(app);

if (hasSingleInstanceLock) {
  const mode: DesktopMode = process.env.COMPANION_DESKTOP_MODE === "production"
    ? "production"
    : "development";
  const lifecycleManager = createDesktopLifecycleManager(mode);
  lifecycleManager.start().catch((error: unknown) => {
    console.error("Unable to start Companion Desktop", error);
    void lifecycleManager.requestQuit();
  });
}
