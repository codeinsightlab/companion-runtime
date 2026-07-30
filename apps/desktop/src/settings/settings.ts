import type {
  DesktopSettingsResult,
  DesktopSettingsSnapshot,
  ListenerDisplayState
} from "../types.js";
import type {
  MouseInteractionMode,
  PetSize
} from "../preferences/DesktopPreferences.js";

const status = document.querySelector<HTMLOutputElement>("#settings-status");
const characterGrid = document.querySelector<HTMLElement>("#character-grid");
const preview = document.querySelector<HTMLImageElement>("#current-pet-preview");
const stateLabels: Record<ListenerDisplayState, string> = {
  running: "运行中",
  stopped: "已停止",
  unavailable: "不可用",
  error: "异常"
};

document.body.dataset.mode = window.companionSettings.getMode();

function showStatus(message: string, error = false): void {
  if (!status) return;
  status.textContent = message;
  status.dataset.error = String(error);
}

function renderCharacters(snapshot: DesktopSettingsSnapshot): void {
  if (!characterGrid) return;
  const existingIds = new Set(
    [...characterGrid.querySelectorAll<HTMLElement>("[data-character-id]")]
      .map(({ dataset }) => dataset.characterId)
  );
  const needsRebuild = existingIds.size !== snapshot.characters.length
    || snapshot.characters.some(({ id }) => !existingIds.has(id));
  if (needsRebuild) {
    characterGrid.replaceChildren(...snapshot.characters.map((character) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "character-card";
      button.dataset.characterId = character.id;
      button.setAttribute("aria-label", `切换到${character.name}`);
      if (character.previewUrl) {
        const image = document.createElement("img");
        image.src = character.previewUrl;
        image.alt = "";
        button.append(image);
      }
      const name = document.createElement("strong");
      name.textContent = character.name;
      const id = document.createElement("span");
      id.textContent = character.id;
      button.append(name, id);
      button.addEventListener("click", () => {
        void apply(window.companionSettings.setCharacter(character.id), "当前伙伴已更新");
      });
      return button;
    }));
  }
  for (const button of characterGrid.querySelectorAll<HTMLButtonElement>("[data-character-id]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.characterId === snapshot.currentCharacterId)
    );
  }
}

function render(snapshot: DesktopSettingsSnapshot): void {
  const current = snapshot.characters.find(({ id }) => id === snapshot.currentCharacterId);
  const title = document.querySelector<HTMLElement>("#current-companion-title");
  const id = document.querySelector<HTMLElement>("#current-companion-id");
  if (title) title.textContent = current?.name ?? snapshot.currentCharacterId;
  if (id) id.textContent = snapshot.currentCharacterId.toUpperCase();
  if (preview) {
    if (current?.previewUrl) {
      preview.src = current.previewUrl;
      preview.alt = `${current.name}预览`;
    } else {
      preview.removeAttribute("src");
      preview.alt = "";
    }
  }

  const presence = document.querySelector<HTMLElement>("#pet-presence");
  if (presence) presence.textContent = snapshot.petVisible ? "正在桌面陪伴" : "当前已隐藏";
  const appState = document.querySelector<HTMLElement>("#app-state");
  if (appState) {
    appState.dataset.connected = String(snapshot.runtimeConnected);
    const label = appState.querySelector("span:last-child");
    if (label) label.textContent = snapshot.runtimeConnected ? "运行中" : "等待连接";
  }
  const runtime = document.querySelector<HTMLElement>('[data-debug="runtime"]');
  if (runtime) runtime.textContent = snapshot.runtimeConnected ? "Renderer 已连接" : "未连接";

  renderCharacters(snapshot);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-pet-size]")) {
    button.setAttribute("aria-pressed", String(button.dataset.petSize === snapshot.petSize));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mouse-mode]")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.mouseMode === snapshot.mouseInteractionMode)
    );
  }
  for (const key of ["cpu", "memory", "battery"] as const) {
    const element = document.querySelector<HTMLElement>(`[data-listener="${key}"]`);
    if (!element) continue;
    element.textContent = stateLabels[snapshot.listeners[key]];
    element.dataset.state = snapshot.listeners[key];
  }
  const systemState = document.querySelector<HTMLElement>("#system-capability-state");
  const systemBadge = document.querySelector<HTMLElement>("#system-capability-badge");
  const systemCard = document.querySelector<HTMLElement>("#system-capability");
  if (systemState) {
    const systemRunning = snapshot.listeners.cpu === "running"
      && snapshot.listeners.memory === "running";
    systemState.textContent = systemRunning ? "正在感知环境" : "当前未连接";
    if (systemBadge) systemBadge.textContent = systemRunning ? "已启用" : "未连接";
    systemCard?.classList.toggle("capability-card--active", systemRunning);
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

for (const button of document.querySelectorAll<HTMLButtonElement>("[data-mouse-mode]")) {
  button.addEventListener("click", () => {
    void apply(
      window.companionSettings.setMouseInteractionMode(
        button.dataset.mouseMode as MouseInteractionMode
      ),
      "鼠标交互模式已更新"
    );
  });
}
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-pet-size]")) {
  button.addEventListener("click", () => {
    void apply(
      window.companionSettings.setPetSize(button.dataset.petSize as PetSize),
      "宠物大小已更新"
    );
  });
}
document.querySelector("#show-pet")?.addEventListener("click", () => {
  void apply(window.companionSettings.showPet(), "宠物已回到桌面");
});
document.querySelector("#hide-pet")?.addEventListener("click", () => {
  void apply(window.companionSettings.hidePet(), "宠物已隐藏，陪伴仍在继续");
});

const developerToggle = document.querySelector<HTMLButtonElement>("#developer-toggle");
const developerPanel = document.querySelector<HTMLElement>("#developer-panel");
developerToggle?.addEventListener("click", () => {
  if (!developerPanel) return;
  const expanded = developerToggle.getAttribute("aria-expanded") !== "true";
  developerToggle.setAttribute("aria-expanded", String(expanded));
  developerPanel.hidden = !expanded;
  const state = developerToggle.querySelector<HTMLElement>(".developer-state");
  if (state) state.textContent = expanded ? "开启" : "关闭";
});

const unsubscribe = window.companionSettings.onUpdated(render);
window.addEventListener("beforeunload", unsubscribe, { once: true });
preview?.addEventListener("error", () => preview.removeAttribute("src"));

void apply(window.companionSettings.getSnapshot(), "伙伴设置已载入").catch((error: unknown) => {
  showStatus(error instanceof Error ? error.message : String(error), true);
});
