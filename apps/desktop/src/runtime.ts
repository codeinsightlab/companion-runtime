import { createCompanionRuntime } from "../../../packages/core/bootstrap/createCompanionRuntime.js";
import type { CharacterRegistry } from "../../../packages/core/bootstrap/CharacterRegistry.js";
import { JsonProfileStore } from "../../../packages/core/profile/storage/JsonProfileStore.js";
import { ExternalEventMapper } from "../../../packages/listeners/core/ExternalEventMapper.js";

const configuration = await window.companionDesktop.loadRuntimeConfiguration();
const characterRegistry: CharacterRegistry = {
  getCharacter(id) {
    return configuration.characters.find((character) => character.id === id);
  },
  listCharacters() {
    return [...configuration.characters];
  }
};
const profileUrl = `data:application/json,${encodeURIComponent(
  JSON.stringify(configuration.userProfile)
)}`;
const externalEventMapper = new ExternalEventMapper({
  "system:cpu_high": { type: "CUSTOM_EVENT", name: "CPU_HIGH" },
  "system:memory_pressure": { type: "CUSTOM_EVENT", name: "MEMORY_PRESSURE" }
});
const context = await createCompanionRuntime({
  profileId: configuration.userProfile.id,
  profileStore: new JsonProfileStore(profileUrl),
  characterRegistry,
  assetBaseUrl: configuration.assetBaseUrl,
  eventMapping: {
    ...configuration.eventMapping,
    "CUSTOM_EVENT:CPU_HIGH": "EXECUTING",
    "CUSTOM_EVENT:MEMORY_PRESSURE": "ERROR"
  },
  behaviorMapping: configuration.behaviorMapping,
  behaviorRules: {
    ...configuration.behaviorRules,
    events: {
      ...configuration.behaviorRules.events,
      "CUSTOM_EVENT:CPU_HIGH": {},
      "CUSTOM_EVENT:MEMORY_PRESSURE": {}
    }
  },
  runtimeConfig: {
    ...configuration.runtimeConfig,
    enabled: true,
    position: "bottom-right",
    size: 128
  },
  personalityProfiles: configuration.personalityProfiles,
  container: document.querySelector<HTMLElement>("#pet-stage") ?? document.body
});

context.runtime.start();

const unsubscribeExternalEvents = window.companionDesktop.onExternalEvent(async (externalEvent) => {
  const internalEvent = context.eventNormalizer.normalize(externalEventMapper.map(externalEvent));
  await context.runtime.publish(internalEvent);
  updateStatus(`SYSTEM:${externalEvent.name}`);
});
window.addEventListener("beforeunload", unsubscribeExternalEvents, { once: true });

const status = document.querySelector<HTMLElement>("#runtime-status");
function updateStatus(prefix: string): void {
  if (!status) return;
  const behavior = context.behaviorEngine.getCurrentBehavior();
  const action = context.petManager.resolveAction(context.petManager.stateMachine.state);
  status.textContent = `${prefix}: ${behavior.slot} / ${action.id}`;
}

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-event]")) {
  button.addEventListener("click", async () => {
    const type = button.dataset.event;
    if (!type) return;
    await context.runtime.publish(context.eventNormalizer.normalize({
      event: type,
      source: { app: "companion-desktop", platform: "macos", collector: "dev-controls" },
      payload: {}
    }));
    updateStatus(type);
  });
}

context.behaviorEngine.addEventListener("recovered", () => updateStatus("RECOVERED"));
updateStatus("READY");
