import electron = require("electron");
import type { CompanionDesktopBridge, CompanionSettingsBridge } from "./types.js";
import type { DesktopChannels } from "./ipc/channels.js";

const channelsArgument = process.argv.find((value) => value.startsWith("--companion-channels="));
if (!channelsArgument) throw new Error("Desktop IPC channels were not provided");
const DESKTOP_CHANNELS = JSON.parse(
  decodeURIComponent(channelsArgument.slice("--companion-channels=".length))
) as DesktopChannels;

const bridge: CompanionDesktopBridge = Object.freeze({
  loadRuntimeConfiguration: () => electron.ipcRenderer.invoke(DESKTOP_CHANNELS.loadRuntimeConfiguration),
  getMode: () => process.argv.includes("--companion-mode=production") ? "production" : "development",
  onExternalEvent: (handler: Parameters<CompanionDesktopBridge["onExternalEvent"]>[0]) => {
    const listener = (_event: electron.IpcRendererEvent, externalEvent: Parameters<typeof handler>[0]) => {
      handler(externalEvent);
    };
    electron.ipcRenderer.on(DESKTOP_CHANNELS.externalEvent, listener);
    return () => electron.ipcRenderer.removeListener(DESKTOP_CHANNELS.externalEvent, listener);
  },
  onRuntimeStop: (handler: Parameters<CompanionDesktopBridge["onRuntimeStop"]>[0]) => {
    const listener = () => {
      try {
        handler();
      } finally {
        electron.ipcRenderer.send(DESKTOP_CHANNELS.runtimeStopped);
      }
    };
    electron.ipcRenderer.on(DESKTOP_CHANNELS.runtimeStop, listener);
    return () => electron.ipcRenderer.removeListener(DESKTOP_CHANNELS.runtimeStop, listener);
  },
  onCharacterChanged: (handler: Parameters<CompanionDesktopBridge["onCharacterChanged"]>[0]) => {
    const listener = (_event: electron.IpcRendererEvent, characterId: string) => handler(characterId);
    electron.ipcRenderer.on(DESKTOP_CHANNELS.characterChanged, listener);
    return () => electron.ipcRenderer.removeListener(DESKTOP_CHANNELS.characterChanged, listener);
  },
  onPetSizeChanged: (handler: Parameters<CompanionDesktopBridge["onPetSizeChanged"]>[0]) => {
    const listener = (_event: electron.IpcRendererEvent, petSize: Parameters<typeof handler>[0], pixels: number) => {
      handler(petSize, pixels);
    };
    electron.ipcRenderer.on(DESKTOP_CHANNELS.petSizeChanged, listener);
    return () => electron.ipcRenderer.removeListener(DESKTOP_CHANNELS.petSizeChanged, listener);
  },
  notifyRuntimeReady: () => electron.ipcRenderer.send(DESKTOP_CHANNELS.runtimeReady),
  notifyRuntimeError: (message: string) => electron.ipcRenderer.send(DESKTOP_CHANNELS.runtimeError, message)
});

const settingsBridge: CompanionSettingsBridge = Object.freeze({
  getSnapshot: () => electron.ipcRenderer.invoke(DESKTOP_CHANNELS.settingsGetSnapshot),
  setCharacter: (characterId: string) => electron.ipcRenderer.invoke(DESKTOP_CHANNELS.settingsSetCharacter, characterId),
  setPetSize: (petSize: Parameters<CompanionSettingsBridge["setPetSize"]>[0]) =>
    electron.ipcRenderer.invoke(DESKTOP_CHANNELS.settingsSetPetSize, petSize),
  showPet: () => electron.ipcRenderer.invoke(DESKTOP_CHANNELS.settingsShowPet),
  hidePet: () => electron.ipcRenderer.invoke(DESKTOP_CHANNELS.settingsHidePet),
  onUpdated: (handler: Parameters<CompanionSettingsBridge["onUpdated"]>[0]) => {
    const listener = (_event: electron.IpcRendererEvent, snapshot: Parameters<typeof handler>[0]) => handler(snapshot);
    electron.ipcRenderer.on(DESKTOP_CHANNELS.settingsUpdated, listener);
    return () => electron.ipcRenderer.removeListener(DESKTOP_CHANNELS.settingsUpdated, listener);
  }
});

if (process.argv.includes("--companion-window=settings")) {
  electron.contextBridge.exposeInMainWorld("companionSettings", settingsBridge);
} else {
  electron.contextBridge.exposeInMainWorld("companionDesktop", bridge);
}
