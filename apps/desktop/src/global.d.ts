import type { CompanionDesktopBridge } from "./types.js";

declare global {
  interface Window {
    companionDesktop: CompanionDesktopBridge;
  }
}

export {};
