import type { UserProfile } from "./UserProfile.js";

export interface ProfileStore {
  load(id: string): Promise<UserProfile | null>;
  save(profile: UserProfile): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<UserProfile[]>;
}
