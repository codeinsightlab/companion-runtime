export const USER_COMMAND_NAMES = [
  "GREET",
  "CELEBRATE",
  "ENCOURAGE",
  "REST"
] as const;

export type UserCommandName = (typeof USER_COMMAND_NAMES)[number];

export interface UserCommand {
  readonly type: "USER_COMMAND";
  readonly name: UserCommandName;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export function isUserCommandName(value: unknown): value is UserCommandName {
  return typeof value === "string"
    && (USER_COMMAND_NAMES as readonly string[]).includes(value);
}
