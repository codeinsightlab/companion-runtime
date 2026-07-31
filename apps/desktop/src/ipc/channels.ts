export const DESKTOP_CHANNELS = Object.freeze({
  loadRuntimeConfiguration: "companion:load-runtime-configuration",
  externalEvent: "companion:external-event",
  userCommand: "companion:user-command",
  runtimeReady: "companion:runtime-ready",
  runtimeStop: "companion:runtime-stop",
  runtimeStopped: "companion:runtime-stopped",
  runtimeError: "companion:runtime-error",
  characterChanged: "companion:character-changed",
  petSizeChanged: "companion:pet-size-changed",
  petDrag: "companion:pet:drag",
  petMouseModeChanged: "companion:pet:mouse-mode-changed",
  settingsGetSnapshot: "companion:settings:get-snapshot",
  settingsSetCharacter: "companion:settings:set-character",
  settingsSetPetSize: "companion:settings:set-pet-size",
  settingsSetMouseMode: "companion:settings:set-mouse-mode",
  settingsShowPet: "companion:settings:show-pet",
  settingsHidePet: "companion:settings:hide-pet",
  settingsSendUserCommand: "companion:settings:send-user-command",
  settingsUpdated: "companion:settings:updated"
});

export type DesktopChannels = typeof DESKTOP_CHANNELS;

export function serializeDesktopChannels(): string {
  return `--companion-channels=${encodeURIComponent(JSON.stringify(DESKTOP_CHANNELS))}`;
}
