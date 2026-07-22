import type { DesktopSettingsResult, DesktopSettingsSnapshot, ListenerDisplayState } from "../types.js";
import type { PetSize } from "../preferences/DesktopPreferences.js";

const characterSelect = document.querySelector<HTMLSelectElement>("#character-select");
const status = document.querySelector<HTMLOutputElement>("#settings-status");
const stateLabels: Record<ListenerDisplayState, string> = {
  running: "运行中",
  stopped: "已停止",
  unavailable: "不可用",
  error: "错误"
};

function showStatus(message: string, error = false): void {
  if (!status) return;
  status.textContent = message;
  status.dataset.error = String(error);
}

function render(snapshot: DesktopSettingsSnapshot): void {
  if (characterSelect) {
    const knownIds = new Set([...characterSelect.options].map(({ value }) => value));
    if (knownIds.size !== snapshot.characters.length || snapshot.characters.some(({ id }) => !knownIds.has(id))) {
      characterSelect.replaceChildren(...snapshot.characters.map(({ id, name }) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = name;
        return option;
      }));
    }
    characterSelect.value = snapshot.currentCharacterId;
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-pet-size]")) {
    button.setAttribute("aria-pressed", String(button.dataset.petSize === snapshot.petSize));
  }
  for (const key of ["cpu", "memory", "battery"] as const) {
    const element = document.querySelector<HTMLElement>(`[data-listener="${key}"]`);
    if (!element) continue;
    element.textContent = stateLabels[snapshot.listeners[key]];
    element.dataset.state = snapshot.listeners[key];
  }
}

async function apply(operation: Promise<DesktopSettingsResult>, success: string): Promise<void> {
  const result = await operation;
  if (!result.ok) {
    showStatus(result.error, true);
    return;
  }
  render(result.snapshot);
  showStatus(success);
}

characterSelect?.addEventListener("change", () => {
  void apply(window.companionSettings.setCharacter(characterSelect.value), "当前宠物已更新");
});
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-pet-size]")) {
  button.addEventListener("click", () => {
    void apply(window.companionSettings.setPetSize(button.dataset.petSize as PetSize), "宠物大小已更新");
  });
}
document.querySelector("#show-pet")?.addEventListener("click", () => {
  void apply(window.companionSettings.showPet(), "宠物窗口已显示");
});
document.querySelector("#hide-pet")?.addEventListener("click", () => {
  void apply(window.companionSettings.hidePet(), "宠物窗口已隐藏");
});
const unsubscribe = window.companionSettings.onUpdated(render);
window.addEventListener("beforeunload", unsubscribe, { once: true });

void apply(window.companionSettings.getSnapshot(), "设置已载入").catch((error: unknown) => {
  showStatus(error instanceof Error ? error.message : String(error), true);
});
