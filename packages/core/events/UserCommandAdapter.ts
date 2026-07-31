import type { CompanionEvent, EventSource } from "./CompanionEvent.js";
import { EventNormalizer } from "./EventNormalizer.js";
import type { UserCommand } from "../types/UserCommand.js";
import { isUserCommandName } from "../types/UserCommand.js";

export class UserCommandAdapter {
  readonly #normalizer: EventNormalizer;

  constructor(normalizer: EventNormalizer) {
    this.#normalizer = normalizer;
  }

  toCompanionEvent(
    command: UserCommand,
    source: EventSource = { app: "companion-control-surface" }
  ): CompanionEvent {
    if (!command || command.type !== "USER_COMMAND" || !isUserCommandName(command.name)) {
      throw new TypeError("UserCommandAdapter requires a valid UserCommand");
    }
    return this.#normalizer.normalize({
      event: "CUSTOM_EVENT",
      name: `USER_COMMAND:${command.name}`,
      source,
      payload: { ...(command.payload ?? {}) }
    });
  }
}
