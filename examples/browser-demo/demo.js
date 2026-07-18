import { PetManager } from "../../packages/core/runtime/PetManager.js";
import { PetEventAdapter } from "../../packages/core/runtime/PetEventAdapter.js";
import { PetBehaviorEngine } from "../../packages/core/runtime/PetBehaviorEngine.js";
import { PetPersonalityEngine } from "../../packages/core/runtime/PetPersonalityEngine.js";

const manifestUrl = new URL("../../packages/core/config/pet-manifest.json", import.meta.url);
const configUrl = new URL("../../packages/core/config/runtime-config.json", import.meta.url);
const eventMappingUrl = new URL("../../packages/core/config/event-mapping.json", import.meta.url);
const behaviorRulesUrl = new URL("../../packages/core/config/behavior-rules.json", import.meta.url);
const personalityProfilesUrl = new URL("../../packages/core/config/personality-profiles.json", import.meta.url);

const manager = await PetManager.create({ manifestUrl, configUrl });
await manager.ready;
const eventAdapter = await PetEventAdapter.create({ petManager: manager, mappingUrl: eventMappingUrl });
const personalityEngine = await PetPersonalityEngine.create({ profilesUrl: personalityProfilesUrl });
const behaviorEngine = await PetBehaviorEngine.create({
  petManager: manager,
  rulesUrl: behaviorRulesUrl,
  personalityEngine
});
behaviorEngine.start();
window.petManager = manager;
window.petEventAdapter = eventAdapter;
window.petBehaviorEngine = behaviorEngine;
window.petPersonalityEngine = personalityEngine;

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

for (const state of manager.listStates()) {
  stateSelect.add(new Option(state, state));
}

function refreshActions() {
  actionSelect.replaceChildren();
  for (const action of manager.character.listActions()) {
    actionSelect.add(new Option(action, action));
  }
  actionSelect.value = manager.character.actionForState(manager.stateMachine.state).id;
}

function refreshStatus() {
  const actionId = manager.viewer.element.dataset.action ?? manager.character.actionForState(manager.stateMachine.state).id;
  status.textContent = `${manager.character.name} / ${manager.stateMachine.state} / ${actionId}`;
}

function refreshBehaviorStatus(prefix = "Behavior", behaviorOverride) {
  const behavior = behaviorOverride ?? behaviorEngine.getCurrentBehavior();
  const action = behavior.selectedAction ?? behavior.action ?? manager.character.actionForState(manager.stateMachine.state).id;
  behaviorStatus.textContent = `${prefix}: ${behavior.event} / ${manager.character.name} / ${behavior.state ?? "DIRECT"} / ${action}`;
}

function refreshPersonalityStatus(behaviorOverride) {
  const behavior = behaviorOverride ?? behaviorEngine.getCurrentBehavior();
  const profile = personalityEngine.getProfile(manager.character.id);
  const selectedAction = behavior.selectedAction ?? behavior.action ?? manager.character.actionForState(manager.stateMachine.state).id;
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
  await manager.changeState(stateSelect.value);
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
    await eventAdapter.handle({ event, payload: { source: "demo" } });
    syncControls();
    const actionId = manager.viewer.element.dataset.action ?? manager.character.actionForState(manager.stateMachine.state).id;
    status.textContent = `${event} → ${manager.character.name} / ${manager.stateMachine.state} / ${actionId}`;
  });
}

for (const button of document.querySelectorAll("[data-behavior-event]")) {
  button.addEventListener("click", async () => {
    const event = button.dataset.behaviorEvent;
    const result = await behaviorEngine.handleEvent({ event, payload: { source: "behavior-demo" } });
    syncControls();
    const actionId = manager.viewer.element.dataset.action ?? manager.character.actionForState(manager.stateMachine.state).id;
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
    const result = await behaviorEngine.handleEvent({ event, payload: { source: "personality-demo" } });
    syncControls();
    const actionId = manager.viewer.element.dataset.action ?? manager.character.actionForState(manager.stateMachine.state).id;
    status.textContent = `${event} → ${manager.character.name} / ${manager.stateMachine.state} / ${actionId}`;
    refreshBehaviorStatus(result.accepted ? "Accepted" : `Ignored (${result.reason})`, result.behavior);
    refreshPersonalityStatus(result.behavior);
  });
}

document.querySelector("#idle-mode").addEventListener("click", async () => {
  await manager.changeState("IDLE");
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
