import type { CompanionDesktopBridge, CompanionSettingsBridge } from "./types.js";

declare global {
  interface Window {
    companionDesktop: CompanionDesktopBridge;
    companionSettings: CompanionSettingsBridge;
  }
}

export {};
