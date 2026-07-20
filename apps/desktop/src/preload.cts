import electron = require("electron");
import type { CompanionDesktopBridge } from "./types.js";

const bridge: CompanionDesktopBridge = Object.freeze({
  loadRuntimeConfiguration: () => electron.ipcRenderer.invoke("companion:load-runtime-configuration"),
  getMode: () => process.argv.includes("--companion-mode=production") ? "production" : "development",
  onExternalEvent: (handler: Parameters<CompanionDesktopBridge["onExternalEvent"]>[0]) => {
    const listener = (_event: electron.IpcRendererEvent, externalEvent: Parameters<typeof handler>[0]) => {
      handler(externalEvent);
    };
    electron.ipcRenderer.on("companion:external-event", listener);
    return () => electron.ipcRenderer.removeListener("companion:external-event", listener);
  },
  onRuntimeStop: (handler: Parameters<CompanionDesktopBridge["onRuntimeStop"]>[0]) => {
    const listener = () => {
      try {
        handler();
      } finally {
        electron.ipcRenderer.send("companion:runtime-stopped");
      }
    };
    electron.ipcRenderer.on("companion:runtime-stop", listener);
    return () => electron.ipcRenderer.removeListener("companion:runtime-stop", listener);
  },
  notifyRuntimeReady: () => electron.ipcRenderer.send("companion:runtime-ready"),
  notifyRuntimeError: (message: string) => electron.ipcRenderer.send("companion:runtime-error", message)
});

electron.contextBridge.exposeInMainWorld("companionDesktop", bridge);
