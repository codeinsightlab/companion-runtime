import { PetCharacter } from "./PetCharacter.js";
import { PET_STATES, PetStateMachine } from "./PetStateMachine.js";
import { PetViewer } from "./PetViewer.js";
import type { CharacterProfile } from "../types/CharacterProfile.js";
import type { PetState } from "../types/PetState.js";
import type {
  JsonUrl,
  PetManagerCreateOptions,
  PetManagerOptions,
  PetManifest,
  PetPosition,
  RuntimeConfig
} from "../types/RuntimeTypes.js";

export class PetManager extends EventTarget {
  readonly manifest: PetManifest;
  readonly characters: ReadonlyMap<string, PetCharacter>;
  character: PetCharacter;
  readonly stateMachine: PetStateMachine;
  readonly viewer: PetViewer;
  ready: Promise<void>;

  static async create({
    manifestUrl,
    configUrl,
    container
  }: PetManagerCreateOptions = {}): Promise<PetManager> {
    if (!manifestUrl) throw new TypeError("PetManager.create requires manifestUrl");

    const [manifest, runtimeConfig] = await Promise.all([
      PetManager.#fetchJson<PetManifest>(manifestUrl),
      configUrl
        ? PetManager.#fetchJson<RuntimeConfig>(configUrl)
        : Promise.resolve({} as RuntimeConfig)
    ]);

    const assetBaseUrl = new URL(manifest.assetBase, manifestUrl).href.replace(/\/$/, "");
    return new PetManager({ manifest, runtimeConfig, assetBaseUrl, container });
  }

  constructor({
    manifest,
    runtimeConfig = {},
    assetBaseUrl,
    container
  }: PetManagerOptions) {
    super();
    this.manifest = manifest;
    this.characters = new Map(
      Object.entries(manifest.characters).map(([id, definition]) => [
        id,
        new PetCharacter({ id, ...definition, assetBase: assetBaseUrl })
      ])
    );

    const characterId = runtimeConfig.character ?? manifest.defaultCharacter;
    const state = runtimeConfig.state ?? manifest.defaultState ?? "IDLE";
    this.character = this.#getCharacter(characterId);
    this.stateMachine = new PetStateMachine(state);
    this.viewer = new PetViewer({
      container,
      position: runtimeConfig.position ?? "bottom-right",
      size: runtimeConfig.size ?? 128
    });

    this.stateMachine.addEventListener("change", () => this.#renderState());
    this.ready = this.#renderState();
    if (runtimeConfig.enabled !== false) this.showPet();
  }

  showPet(): void {
    this.viewer.show();
  }

  hidePet(): void {
    this.viewer.hide();
  }

  async changeCharacter(characterId: string): Promise<void> {
    this.character = this.#getCharacter(characterId);
    await this.#renderState();
    this.dispatchEvent(new CustomEvent("characterchange", { detail: { character: this.character } }));
  }

  changeState(state: PetState): Promise<void> {
    const changed = this.stateMachine.transition(state, { characterId: this.character.id });
    if (!changed) return this.#renderState();
    return this.ready;
  }

  async changeAction(actionId: string): Promise<void> {
    const action = this.character.getAction(actionId);
    await this.viewer.display(action, this.character.name);
    this.dispatchEvent(new CustomEvent("actionchange", { detail: { action, character: this.character } }));
  }

  setPosition(position: PetPosition): void {
    this.viewer.setPosition(position);
  }

  setSize(size: number | string): void {
    this.viewer.setSize(size);
  }

  listCharacters(): Array<Pick<CharacterProfile, "id" | "name">> {
    return [...this.characters.values()].map(({ id, name }) => ({ id, name }));
  }

  listStates(): PetState[] {
    return [...PET_STATES];
  }

  destroy(): void {
    this.viewer.destroy();
  }

  #getCharacter(characterId: string): PetCharacter {
    const character = this.characters.get(characterId);
    if (!character) throw new RangeError(`Unknown character "${characterId}"`);
    return character;
  }

  #renderState(): Promise<void> {
    const action = this.character.actionForState(this.stateMachine.state);
    this.ready = this.viewer.display(action, this.character.name);
    return this.ready;
  }

  static async #fetchJson<T>(url: JsonUrl): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load ${url}: HTTP ${response.status}`);
    return await response.json() as T;
  }
}
