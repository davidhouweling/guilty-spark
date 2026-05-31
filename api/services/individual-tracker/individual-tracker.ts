import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { DatabaseService } from "../database/database";
import type { IndividualTrackerProfilesRow } from "../database/types/individual_tracker_profiles";
import type { IndividualTrackerStatus, IndividualTrackersRow } from "../database/types/individual_trackers";
import { IdentityNotOwnedError, ProfileNotFoundError, TrackerLimitReachedError, TrackerNotFoundError } from "./errors";
import type { CreateTrackerOptions, UpdateProfileOptions } from "./types";

export const MAX_TRACKERS_PER_USER = 5;

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

  async listTrackers(userId: string): Promise<IndividualTrackersRow[]> {
    return await this.databaseService.findIndividualTrackersByUserId(userId);
  }

  async createTracker(options: CreateTrackerOptions): Promise<IndividualTrackersRow> {
    const existing = await this.databaseService.findIndividualTrackersByUserId(options.userId);
    const alreadyTracked = existing.find((tracker) => tracker.Xuid === options.xuid);

    if (alreadyTracked == null && existing.length >= MAX_TRACKERS_PER_USER) {
      throw new TrackerLimitReachedError();
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const trackerId = alreadyTracked?.TrackerId ?? crypto.randomUUID();
    const tracker: IndividualTrackersRow = {
      TrackerId: trackerId,
      UserId: options.userId,
      Gamertag: options.gamertag,
      Xuid: options.xuid,
      Status: "active",
      IsLive: alreadyTracked?.IsLive ?? 0,
      CreatedAt: alreadyTracked?.CreatedAt ?? nowEpoch,
      UpdatedAt: nowEpoch,
    };
    await this.databaseService.upsertIndividualTracker(tracker);
    return tracker;
  }

  async getOwnedTracker(userId: string, trackerId: string): Promise<IndividualTrackersRow> {
    const tracker = await this.databaseService.getIndividualTracker(trackerId);
    if (tracker?.UserId !== userId) {
      throw new TrackerNotFoundError();
    }
    return tracker;
  }

  async markTrackerStatus(
    tracker: IndividualTrackersRow,
    status: IndividualTrackerStatus,
  ): Promise<IndividualTrackersRow> {
    const updated: IndividualTrackersRow = {
      ...tracker,
      Status: status,
      IsLive: status === "stopped" ? 0 : tracker.IsLive,
      UpdatedAt: Math.floor(Date.now() / 1000),
    };
    await this.databaseService.upsertIndividualTracker(updated);
    return updated;
  }

  async setLiveTracker(userId: string, trackerId: string): Promise<IndividualTrackersRow> {
    await this.getOwnedTracker(userId, trackerId);
    await this.databaseService.setLiveIndividualTracker(userId, trackerId);
    const refreshed = await this.databaseService.getIndividualTracker(trackerId);
    return Preconditions.checkExists(refreshed, "Tracker disappeared after setting live");
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
