import type { ActionResolver } from "../behavior/ActionResolver.js";
import { PetCharacter } from "./PetCharacter.js";
import { BEHAVIOR_SLOTS, PetStateMachine } from "./PetStateMachine.js";
import { PetViewer } from "./PetViewer.js";
import { ProfileManager } from "../profile/ProfileManager.js";
import type { CharacterProfile } from "../types/CharacterProfile.js";
import type { BehaviorSlot } from "../types/BehaviorSlot.js";
import type {
  BehaviorActionMapping,
  PetManagerOptions,
  PetPosition
} from "../types/RuntimeTypes.js";
import type { UserProfileRuntimeConfiguration } from "../profile/UserProfile.js";

export class PetManager extends EventTarget {
  readonly characters: ReadonlyMap<string, PetCharacter>;
  readonly behaviorMapping: BehaviorActionMapping;
  readonly actionResolver: ActionResolver;
  userProfile: UserProfileRuntimeConfiguration;
  readonly profileManager: ProfileManager;
  character: PetCharacter;
  readonly stateMachine: PetStateMachine;
  readonly viewer: PetViewer;
  ready: Promise<void>;

  constructor({
    characterDefinitions,
    behaviorMapping,
    actionResolver,
    userProfile,
    profileManager,
    runtimeConfig = {},
    assetBaseUrl,
    container
  }: PetManagerOptions) {
    super();
    this.userProfile = userProfile;
    this.profileManager = profileManager;
    this.behaviorMapping = behaviorMapping;
    this.characters = new Map(
      characterDefinitions.map((definition) => [
        definition.id,
        new PetCharacter({ ...definition, assetBase: assetBaseUrl })
      ])
    );
    this.actionResolver = actionResolver;

    const characterId = userProfile.characterId;
    const behavior = runtimeConfig.behavior ?? "IDLE";
    this.character = this.#getCharacter(characterId);
    this.stateMachine = new PetStateMachine(behavior);
    this.viewer = new PetViewer({
      container,
      position: runtimeConfig.position ?? "bottom-right",
      size: runtimeConfig.size ?? 128
    });

    this.profileManager.onChange(async (profile) => {
      this.userProfile = profile;
      this.character = this.#getCharacter(profile.characterId);
      this.actionResolver.setUserMapping(profile.behaviorMapping);
      await this.#renderBehavior();
      this.dispatchEvent(new CustomEvent("characterchange", {
        detail: { character: this.character, profile: this.profileManager.getCurrentProfile() }
      }));
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
    await this.profileManager.switchCharacter(characterId);
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
}
