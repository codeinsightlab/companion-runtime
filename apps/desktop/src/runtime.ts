import { createCompanionRuntime } from "../../../packages/core/bootstrap/createCompanionRuntime.js";
import type { CharacterRegistry } from "../../../packages/core/bootstrap/CharacterRegistry.js";
import { JsonProfileStore } from "../../../packages/core/profile/storage/JsonProfileStore.js";
import { ExternalEventMapper } from "../../../packages/listeners/core/ExternalEventMapper.js";
import { UserCommandAdapter } from "../../../packages/core/events/UserCommandAdapter.js";

async function initializeDesktopRuntime(): Promise<void> {
  document.body.dataset.mode = window.companionDesktop.getMode();
  const configuration = await window.companionDesktop.loadRuntimeConfiguration();
  const petStage = document.querySelector<HTMLElement>("#pet-stage");
  let dragPoint: { x: number; y: number } | undefined;
  let dragged = false;
  petStage?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragPoint = { x: event.screenX, y: event.screenY };
    dragged = false;
    petStage.setPointerCapture(event.pointerId);
  });
  petStage?.addEventListener("pointermove", (event) => {
    if (!dragPoint) return;
    const deltaX = event.screenX - dragPoint.x;
    const deltaY = event.screenY - dragPoint.y;
    if (!deltaX && !deltaY) return;
    dragged = true;
    dragPoint = { x: event.screenX, y: event.screenY };
    window.companionDesktop.dragPetBy(deltaX, deltaY);
  });
  const endDrag = (): void => { dragPoint = undefined; };
  petStage?.addEventListener("pointerup", endDrag);
  petStage?.addEventListener("pointercancel", endDrag);
  petStage?.addEventListener("click", () => {
    if (dragged) {
      dragged = false;
      return;
    }
    petStage.classList.remove("pet-stage--clicked");
    requestAnimationFrame(() => petStage.classList.add("pet-stage--clicked"));
  });
  const unsubscribeMouseMode = window.companionDesktop.onMouseInteractionModeChanged((mode) => {
    document.body.dataset.mouseMode = mode;
  });
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
    "system:memory_pressure": { type: "CUSTOM_EVENT", name: "MEMORY_PRESSURE" },
    "system:battery_low": { type: "CUSTOM_EVENT", name: "BATTERY_LOW" }
  });
  const context = await createCompanionRuntime({
    profileId: configuration.userProfile.id,
    profileStore: new JsonProfileStore(profileUrl),
    characterRegistry,
    assetBaseUrl: configuration.assetBaseUrl,
    eventMapping: {
      ...configuration.eventMapping,
      "CUSTOM_EVENT:CPU_HIGH": "EXECUTING",
      "CUSTOM_EVENT:MEMORY_PRESSURE": "ERROR",
      "CUSTOM_EVENT:BATTERY_LOW": "ERROR",
      "CUSTOM_EVENT:USER_COMMAND:GREET": "THINKING",
      "CUSTOM_EVENT:USER_COMMAND:CELEBRATE": "SUCCESS",
      "CUSTOM_EVENT:USER_COMMAND:ENCOURAGE": "EXECUTING",
      "CUSTOM_EVENT:USER_COMMAND:REST": "IDLE"
    },
    behaviorMapping: configuration.behaviorMapping,
    behaviorRules: {
      ...configuration.behaviorRules,
      events: {
        ...configuration.behaviorRules.events,
        "CUSTOM_EVENT:CPU_HIGH": {
          duration: 3000,
          recover: "IDLE",
          cooldownKey: "SYSTEM_CPU_HIGH"
        },
        "CUSTOM_EVENT:MEMORY_PRESSURE": {
          duration: 5000,
          recover: "IDLE",
          cooldownKey: "SYSTEM_MEMORY_PRESSURE"
        },
        "CUSTOM_EVENT:BATTERY_LOW": {
          duration: 5000,
          recover: "IDLE",
          cooldownKey: "SYSTEM_BATTERY_LOW"
        },
        "CUSTOM_EVENT:USER_COMMAND:GREET": {
          duration: 1200,
          recover: "IDLE",
          cooldownKey: "USER_GREET"
        },
        "CUSTOM_EVENT:USER_COMMAND:CELEBRATE": {
          duration: 3000,
          recover: "IDLE",
          cooldownKey: "USER_CELEBRATE"
        },
        "CUSTOM_EVENT:USER_COMMAND:ENCOURAGE": {
          duration: 1800,
          recover: "IDLE",
          cooldownKey: "USER_ENCOURAGE"
        },
        "CUSTOM_EVENT:USER_COMMAND:REST": {
          duration: 600,
          recover: "IDLE",
          cooldownKey: "USER_REST"
        }
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

  const status = document.querySelector<HTMLElement>("#runtime-status");
  function updateStatus(prefix: string): void {
    if (!status) return;
    const behavior = context.behaviorEngine.getCurrentBehavior();
    const action = context.petManager.resolveAction(context.petManager.stateMachine.state);
    status.textContent = `${prefix}: ${behavior.slot} / ${action.id}`;
  }

  const unsubscribeRuntimeStop = window.companionDesktop.onRuntimeStop(() => {
    context.runtime.stop();
  });
  const unsubscribeExternalEvents = window.companionDesktop.onExternalEvent((externalEvent) => {
    void (async () => {
      const internalEvent = context.eventNormalizer.normalize(externalEventMapper.map(externalEvent));
      await context.runtime.publish(internalEvent);
      updateStatus(`SYSTEM:${externalEvent.name}`);
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      window.companionDesktop.notifyRuntimeError(message);
      console.error("Unable to process External Event", error);
    });
  });
  const userCommandAdapter = new UserCommandAdapter(context.eventNormalizer);
  const unsubscribeUserCommands = window.companionDesktop.onUserCommand((command) => {
    void context.runtime.publish(userCommandAdapter.toCompanionEvent(command, {
      app: "companion-control-surface",
      platform: "macos"
    })).then((result) => updateStatus(`USER:${command.name}:${result?.status ?? "unhandled"}`))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        window.companionDesktop.notifyRuntimeError(message);
        console.error("Unable to process User Command", error);
      });
  });
  const unsubscribeCharacterChanged = window.companionDesktop.onCharacterChanged((characterId) => {
    void context.petManager.changeCharacter(characterId).then(() => updateStatus(`CHARACTER:${characterId}`))
      .catch((error: unknown) => {
        window.companionDesktop.notifyRuntimeError(error instanceof Error ? error.message : String(error));
      });
  });
  const unsubscribePetSizeChanged = window.companionDesktop.onPetSizeChanged((_petSize, pixels) => {
    context.petManager.setSize(pixels);
  });

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
  window.addEventListener("beforeunload", () => {
    unsubscribeExternalEvents();
    unsubscribeUserCommands();
    unsubscribeCharacterChanged();
    unsubscribePetSizeChanged();
    unsubscribeMouseMode();
    unsubscribeRuntimeStop();
    context.runtime.stop();
  }, { once: true });
  updateStatus("READY");
  window.companionDesktop.notifyRuntimeReady();
}

void initializeDesktopRuntime().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  window.companionDesktop.notifyRuntimeError(message);
  console.error("Unable to initialize Companion Runtime", error);
});
