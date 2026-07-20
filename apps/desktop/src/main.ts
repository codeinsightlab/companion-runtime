import { app, Menu } from "electron";
import { createDesktopLifecycleManager } from "./lifecycle/createDesktopLifecycleManager.js";
import type { DesktopMode } from "./window.js";
import { acquireSingleInstanceLock } from "./lifecycle/singleInstance.js";
import { installMacApplicationIdentity } from "./macos/ApplicationIdentity.js";

const hasSingleInstanceLock = acquireSingleInstanceLock(app);

if (hasSingleInstanceLock) {
  const mode: DesktopMode = process.env.COMPANION_DESKTOP_MODE === "production"
    ? "production"
    : "development";
  const lifecycleManager = createDesktopLifecycleManager(mode);
  const startDesktop = async (): Promise<void> => {
    if (process.platform === "darwin") {
      await installMacApplicationIdentity({
        application: app,
        menu: Menu,
        requestQuit: () => lifecycleManager.requestQuit()
      });
    }
    await lifecycleManager.start();
  };

  startDesktop().catch((error: unknown) => {
    console.error("Unable to start Companion Desktop", error);
    void lifecycleManager.requestQuit();
  });
}
