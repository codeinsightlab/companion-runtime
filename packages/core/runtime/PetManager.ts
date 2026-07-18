import { ActionResolver } from "../behavior/ActionResolver.js";
import { PetCharacter } from "./PetCharacter.js";
import { BEHAVIOR_SLOTS, PetStateMachine } from "./PetStateMachine.js";
import { PetViewer } from "./PetViewer.js";
import { UserProfileResolver } from "../profile/UserProfileResolver.js";
import type { CharacterProfile } from "../types/CharacterProfile.js";
import type { BehaviorSlot } from "../types/BehaviorSlot.js";
import type {
  BehaviorActionMapping,
  JsonUrl,
  PetManagerCreateOptions,
  PetManagerOptions,
  PetManifest,
  PetPosition,
  RuntimeConfig
} from "../types/RuntimeTypes.js";
import type { CharacterManifest } from "../types/CharacterManifest.js";
import type { UserProfile, UserProfileRuntimeConfiguration } from "../profile/UserProfile.js";

export class PetManager extends EventTarget {
  readonly manifest: PetManifest;
  readonly characters: ReadonlyMap<string, PetCharacter>;
  readonly actionResolver: ActionResolver;
  readonly userProfile: UserProfileRuntimeConfiguration;
  character: PetCharacter;
  readonly stateMachine: PetStateMachine;
  readonly viewer: PetViewer;
  ready: Promise<void>;

  static async create({
    manifestUrl,
    configUrl,
    behaviorMappingUrl,
    profileUrl,
    container
  }: PetManagerCreateOptions = {}): Promise<PetManager> {
    if (!manifestUrl) throw new TypeError("PetManager.create requires manifestUrl");
    if (!behaviorMappingUrl) throw new TypeError("PetManager.create requires behaviorMappingUrl");
    if (!profileUrl) throw new TypeError("PetManager.create requires profileUrl");

    const [manifest, runtimeConfig, behaviorMapping, userProfile] = await Promise.all([
      PetManager.#fetchJson<PetManifest>(manifestUrl),
      configUrl
        ? PetManager.#fetchJson<RuntimeConfig>(configUrl)
        : Promise.resolve({} as RuntimeConfig),
      PetManager.#fetchJson<BehaviorActionMapping>(behaviorMappingUrl),
      PetManager.#fetchJson<UserProfile>(profileUrl)
    ]);
    const assetBaseUrl = new URL(manifest.assetBase, manifestUrl).href.replace(/\/$/, "");
    const characterDefinitions = await Promise.all(
      Object.entries(manifest.characters).map(async ([characterId, configPath]) => {
        const definition = await PetManager.#fetchJson<CharacterManifest>(
          new URL(configPath, `${assetBaseUrl}/`)
        );
        if (definition.id !== characterId) {
          throw new TypeError(
            `Character config id "${definition.id}" does not match manifest id "${characterId}"`
          );
        }
        return { ...definition, assetBase: assetBaseUrl };
      })
    );
    const selectedDefinition = characterDefinitions.find(
      (definition) => definition.id === userProfile.characterId
    );
    if (!selectedDefinition) {
      throw new RangeError(`Unknown UserProfile character "${userProfile.characterId}"`);
    }
    const resolvedProfile = new UserProfileResolver().resolve(userProfile, selectedDefinition);

    return new PetManager({
      manifest,
      characterDefinitions,
      behaviorMapping,
      userProfile: resolvedProfile,
      runtimeConfig,
      assetBaseUrl,
      container
    });
  }

  constructor({
    manifest,
    characterDefinitions,
    behaviorMapping,
    userProfile,
    runtimeConfig = {},
    assetBaseUrl,
    container
  }: PetManagerOptions) {
    super();
    this.manifest = manifest;
    this.userProfile = userProfile;
    this.characters = new Map(
      characterDefinitions.map((definition) => [
        definition.id,
        new PetCharacter({ ...definition, assetBase: assetBaseUrl })
      ])
    );
    this.actionResolver = new ActionResolver(behaviorMapping, userProfile.behaviorMapping);

    const characterId = userProfile.characterId;
    const behavior = runtimeConfig.behavior ?? manifest.defaultBehavior ?? "IDLE";
    this.character = this.#getCharacter(characterId);
    this.stateMachine = new PetStateMachine(behavior);
    this.viewer = new PetViewer({
      container,
      position: runtimeConfig.position ?? "bottom-right",
      size: runtimeConfig.size ?? 128
    });

    this.stateMachine.addEventListener("change", () => this.#renderBehavior());
    this.ready = this.#renderBehavior();
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
    await this.#renderBehavior();
    this.dispatchEvent(new CustomEvent("characterchange", { detail: { character: this.character } }));
  }

  changeBehavior(slot: BehaviorSlot): Promise<void> {
    const changed = this.stateMachine.transition(slot, { characterId: this.character.id });
    if (!changed) return this.#renderBehavior();
    return this.ready;
  }

  resolveAction(slot: BehaviorSlot) {
    return this.actionResolver.resolve(this.character, slot);
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

  listBehaviorSlots(): BehaviorSlot[] {
    return [...BEHAVIOR_SLOTS];
  }

  destroy(): void {
    this.viewer.destroy();
  }

  #getCharacter(characterId: string): PetCharacter {
    const character = this.characters.get(characterId);
    if (!character) throw new RangeError(`Unknown character "${characterId}"`);
    return character;
  }

  #renderBehavior(): Promise<void> {
    const action = this.resolveAction(this.stateMachine.state);
    this.ready = this.viewer.display(action, this.character.name);
    return this.ready;
  }

  static async #fetchJson<T>(url: JsonUrl): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load ${url}: HTTP ${response.status}`);
    return await response.json() as T;
  }
}
