import { app, Menu } from "electron";
import { createDesktopLifecycleManager } from "./lifecycle/createDesktopLifecycleManager.js";
import type { DesktopMode } from "./window.js";
import { acquireSingleInstanceLock } from "./lifecycle/singleInstance.js";
import { installMacApplicationIdentity } from "./macos/ApplicationIdentity.js";
import { join } from "node:path";
import { DesktopFileLogger } from "./logging/DesktopLogger.js";

const hasSingleInstanceLock = acquireSingleInstanceLock(app);

if (hasSingleInstanceLock) {
  app.setName("Companion");
  const logger = new DesktopFileLogger({
    directory: join(app.getPath("appData"), "Companion", "logs")
  });
  const mode: DesktopMode = app.isPackaged || process.env.COMPANION_DESKTOP_MODE === "production"
    ? "production"
    : "development";
  let lifecycleManager: Awaited<ReturnType<typeof createDesktopLifecycleManager>> | undefined;
  const requestQuit = (): Promise<void> => lifecycleManager
    ? lifecycleManager.requestQuit()
    : Promise.resolve().then(() => app.quit());
  const startDesktop = async (): Promise<void> => {
    logger.info("application.startup", { mode, version: app.getVersion(), packaged: app.isPackaged });
    if (process.platform === "darwin") {
      await installMacApplicationIdentity({
        application: app,
        menu: Menu,
        requestQuit
      });
    }
    lifecycleManager = await createDesktopLifecycleManager(mode, logger);
    await lifecycleManager.start();
  };

  startDesktop().catch((error: unknown) => {
    logger.error("application.startup.failed", { message: error instanceof Error ? error.message : String(error) });
    console.error("Unable to start Companion Desktop", error);
    void requestQuit();
  });
}
