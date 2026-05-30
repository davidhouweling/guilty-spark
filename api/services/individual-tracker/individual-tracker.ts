import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { DatabaseService } from "../database/database";
import type { IndividualTrackerProfilesRow } from "../database/types/individual_tracker_profiles";
import { IdentityNotOwnedError, ProfileNotFoundError } from "./errors";
import type { UpdateProfileOptions } from "./types";

export interface IndividualTrackerServiceOpts {
  databaseService: DatabaseService;
}

export class IndividualTrackerService {
  private readonly databaseService: DatabaseService;

  constructor({ databaseService }: IndividualTrackerServiceOpts) {
    this.databaseService = databaseService;
  }

  async getOrCreateProfile(userId: string): Promise<IndividualTrackerProfilesRow> {
    const profiles = await this.databaseService.findIndividualTrackerProfilesByUserId(userId);
    const [existing] = profiles;
    if (existing != null) {
      return existing;
    }

    const identities = await this.databaseService.findLinkedIdentitiesByUserId(userId);
    const activeXboxIdentity = identities.find((identity) => identity.Provider === "xbox" && identity.IsActive === 1);
    const nowEpoch = Math.floor(Date.now() / 1000);
    const profile: IndividualTrackerProfilesRow = {
      ProfileId: crypto.randomUUID(),
      UserId: userId,
      ActiveIdentityId: activeXboxIdentity?.IdentityId ?? null,
      Name: "default",
      CreatedAt: nowEpoch,
      UpdatedAt: nowEpoch,
    };
    await this.databaseService.createIndividualTrackerProfile(profile);
    return profile;
  }

  async updateProfile(options: UpdateProfileOptions): Promise<IndividualTrackerProfilesRow> {
    const existing = await this.databaseService.getIndividualTrackerProfile(options.profileId);
    if (existing?.UserId !== options.userId) {
      throw new ProfileNotFoundError();
    }

    await this.assertIdentityOwned(options.userId, options.activeIdentityId);

    const updates: Partial<Pick<IndividualTrackerProfilesRow, "ActiveIdentityId" | "Name" | "UpdatedAt">> = {
      UpdatedAt: Math.floor(Date.now() / 1000),
    };
    if (options.name !== undefined && options.name.trim() !== "") {
      updates.Name = options.name;
    }
    if (options.activeIdentityId !== undefined) {
      updates.ActiveIdentityId = options.activeIdentityId;
    }

    await this.databaseService.updateIndividualTrackerProfile(options.profileId, updates);
    const updated = await this.databaseService.getIndividualTrackerProfile(options.profileId);
    return Preconditions.checkExists(updated, "Profile disappeared after update");
  }

  private async assertIdentityOwned(userId: string, activeIdentityId: string | null | undefined): Promise<void> {
    if (activeIdentityId == null) {
      return;
    }
    const identities = await this.databaseService.findLinkedIdentitiesByUserId(userId);
    if (!identities.some((identity) => identity.IdentityId === activeIdentityId)) {
      throw new IdentityNotOwnedError();
    }
  }
}
