import { createCompanionRuntime } from "../../packages/core/bootstrap/createCompanionRuntime.js";
import { JsonProfileStore } from "../../packages/core/profile/storage/JsonProfileStore.js";

const manifestUrl = new URL("../../packages/core/config/pet-manifest.json", import.meta.url);
const configUrl = new URL("../../packages/core/config/runtime-config.json", import.meta.url);
const eventMappingUrl = new URL("../../packages/core/config/event-mapping.json", import.meta.url);
const behaviorMappingUrl = new URL("../../packages/core/config/behavior-mapping.json", import.meta.url);
const profileUrl = new URL("../../packages/core/config/user-profile.json", import.meta.url);
const behaviorRulesUrl = new URL("../../packages/core/config/behavior-rules.json", import.meta.url);
const personalityProfilesUrl = new URL("../../packages/core/config/personality-profiles.json", import.meta.url);

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to load ${url}: HTTP ${response.status}`);
  return response.json();
}

const [petManifest, runtimeConfig, eventMapping, behaviorMapping, behaviorRules, personalityProfiles] =
  await Promise.all([
    fetchJson(manifestUrl),
    fetchJson(configUrl),
    fetchJson(eventMappingUrl),
    fetchJson(behaviorMappingUrl),
    fetchJson(behaviorRulesUrl),
    fetchJson(personalityProfilesUrl)
  ]);
const assetBaseUrl = new URL(petManifest.assetBase, manifestUrl).href.replace(/\/$/, "");
const characters = await Promise.all(
  Object.entries(petManifest.characters).map(async ([characterId, path]) => {
    const character = await fetchJson(new URL(path, `${assetBaseUrl}/`));
    if (character.id !== characterId) throw new Error(`Character id mismatch: ${characterId}`);
    return character;
  })
);
const characterRegistry = {
  getCharacter(id) {
    return characters.find((character) => character.id === id);
  },
  listCharacters() {
    return [...characters];
  }
};
const profileStore = new JsonProfileStore(profileUrl);
const context = await createCompanionRuntime({
  profileId: "default",
  profileStore,
  characterRegistry,
  assetBaseUrl,
  eventMapping,
  behaviorMapping,
  behaviorRules,
  runtimeConfig,
  personalityProfiles
});
const {
  petManager: manager,
  behaviorEngine,
  eventNormalizer,
  runtime
} = context;
await manager.ready;
const personalityEngine = behaviorEngine.personalityEngine;
if (!personalityEngine) throw new Error("Browser Demo requires personality profiles");
runtime.start();
window.petManager = manager;
window.petBehaviorEngine = behaviorEngine;
window.petPersonalityEngine = personalityEngine;
window.companionRuntime = context;

const characterSelect = document.querySelector("#character");
const stateSelect = document.querySelector("#state");
const actionSelect = document.querySelector("#action");
const positionSelect = document.querySelector("#position");
const sizeInput = document.querySelector("#size");
const sizeOutput = document.querySelector("#size-output");
const status = document.querySelector("#runtime-status");
const behaviorStatus = document.querySelector("#behavior-status");
const personalityStatus = document.querySelector("#personality-status");

for (const character of manager.listCharacters()) {
  characterSelect.add(new Option(character.name, character.id));
}

for (const slot of manager.listBehaviorSlots()) {
  stateSelect.add(new Option(slot, slot));
}

function createEvent(type, source) {
  return eventNormalizer.normalize({
    event: type,
    source: { app: "browser-demo", collector: source },
    payload: {}
  });
}

function refreshActions() {
  actionSelect.replaceChildren();
  for (const action of manager.character.listActions()) {
    actionSelect.add(new Option(action, action));
  }
  actionSelect.value = manager.resolveAction(manager.stateMachine.state).id;
}

function refreshStatus() {
  const actionId = manager.viewer.element.dataset.action ?? manager.resolveAction(manager.stateMachine.state).id;
  status.textContent = `${manager.character.name} / ${manager.stateMachine.state} / ${actionId}`;
}

function refreshBehaviorStatus(prefix = "Behavior", behaviorOverride) {
  const behavior = behaviorOverride ?? behaviorEngine.getCurrentBehavior();
  const action = behavior.selectedAction ?? manager.resolveAction(manager.stateMachine.state).id;
  behaviorStatus.textContent = `${prefix}: ${behavior.event} / ${manager.character.name} / ${behavior.slot} / ${action}`;
}

function refreshPersonalityStatus(behaviorOverride) {
  const behavior = behaviorOverride ?? behaviorEngine.getCurrentBehavior();
  const profile = personalityEngine.getProfile(manager.character.id);
  const selectedAction = behavior.selectedAction ?? manager.resolveAction(manager.stateMachine.state).id;
  personalityStatus.textContent = `${manager.character.name} / ${profile.mood ?? "normal"} / ${selectedAction}`;
}

function syncControls() {
  characterSelect.value = manager.character.id;
  stateSelect.value = manager.stateMachine.state;
  refreshActions();
  refreshStatus();
  refreshBehaviorStatus();
  refreshPersonalityStatus();
}

characterSelect.value = manager.character.id;
stateSelect.value = manager.stateMachine.state;
refreshActions();
refreshStatus();
refreshBehaviorStatus();
refreshPersonalityStatus();

characterSelect.addEventListener("change", async () => {
  await manager.changeCharacter(characterSelect.value);
  refreshActions();
  refreshStatus();
});

stateSelect.addEventListener("change", async () => {
  await manager.changeBehavior(stateSelect.value);
  refreshActions();
  refreshStatus();
});

actionSelect.addEventListener("change", async () => {
  await manager.changeAction(actionSelect.value);
  status.textContent = `${manager.character.name} / DIRECT / ${actionSelect.value}`;
});

positionSelect.addEventListener("change", () => manager.setPosition(positionSelect.value));
sizeInput.addEventListener("input", () => {
  manager.setSize(sizeInput.value);
  sizeOutput.value = `${sizeInput.value}px`;
});
document.querySelector("#show").addEventListener("click", () => manager.showPet());
document.querySelector("#hide").addEventListener("click", () => manager.hidePet());

for (const button of document.querySelectorAll("[data-pet-event]")) {
  button.addEventListener("click", async () => {
    const event = button.dataset.petEvent;
    await runtime.publish(createEvent(event, "event-adapter-demo"));
    syncControls();
    const actionId = manager.viewer.element.dataset.action ?? manager.resolveAction(manager.stateMachine.state).id;
    status.textContent = `${event} → ${manager.character.name} / ${manager.stateMachine.state} / ${actionId}`;
  });
}

for (const button of document.querySelectorAll("[data-behavior-event]")) {
  button.addEventListener("click", async () => {
    const event = button.dataset.behaviorEvent;
    const result = await behaviorEngine.handleEvent(createEvent(event, "behavior-demo"));
    syncControls();
    const actionId = manager.viewer.element.dataset.action ?? manager.resolveAction(manager.stateMachine.state).id;
    status.textContent = `${event} → ${manager.character.name} / ${manager.stateMachine.state} / ${actionId}`;
    refreshBehaviorStatus(result.accepted ? "Accepted" : `Ignored (${result.reason})`, result.behavior);
    refreshPersonalityStatus(result.behavior);
  });
}

for (const button of document.querySelectorAll("[data-personality-character]")) {
  button.addEventListener("click", async () => {
    const character = button.dataset.personalityCharacter;
    const event = button.dataset.personalityEvent;
    await manager.changeCharacter(character);
    const result = await behaviorEngine.handleEvent(createEvent(event, "personality-demo"));
    syncControls();
    const actionId = manager.viewer.element.dataset.action ?? manager.resolveAction(manager.stateMachine.state).id;
    status.textContent = `${event} → ${manager.character.name} / ${manager.stateMachine.state} / ${actionId}`;
    refreshBehaviorStatus(result.accepted ? "Accepted" : `Ignored (${result.reason})`, result.behavior);
    refreshPersonalityStatus(result.behavior);
  });
}

document.querySelector("#idle-mode").addEventListener("click", async () => {
  await manager.changeBehavior("IDLE");
  behaviorEngine.stop();
  behaviorEngine.start();
  syncControls();
  refreshBehaviorStatus("Idle timer restarted");
});

behaviorEngine.addEventListener("recovered", () => syncControls());
behaviorEngine.addEventListener("idle", () => syncControls());
behaviorEngine.addEventListener("ignored", (event) => {
  refreshBehaviorStatus(`Ignored (${event.detail.reason})`, event.detail.behavior);
  refreshPersonalityStatus(event.detail.behavior);
});
behaviorEngine.addEventListener("accepted", (event) => refreshPersonalityStatus(event.detail.behavior));
