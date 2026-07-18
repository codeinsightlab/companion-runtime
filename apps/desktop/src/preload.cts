import electron = require("electron");
import type { CompanionDesktopBridge } from "./types.js";

const bridge: CompanionDesktopBridge = Object.freeze({
  loadRuntimeConfiguration: () => electron.ipcRenderer.invoke("companion:load-runtime-configuration"),
  onExternalEvent: (handler: Parameters<CompanionDesktopBridge["onExternalEvent"]>[0]) => {
    const listener = (_event: electron.IpcRendererEvent, externalEvent: Parameters<typeof handler>[0]) => {
      handler(externalEvent);
    };
    electron.ipcRenderer.on("companion:external-event", listener);
    return () => electron.ipcRenderer.removeListener("companion:external-event", listener);
  }
});

electron.contextBridge.exposeInMainWorld("companionDesktop", bridge);
