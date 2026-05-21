import type { DatabaseService } from "../database/database";
import type { IndividualTrackerProfilesRow } from "../database/types/individual_tracker_profiles";
import type { IndividualTrackerGamesRow } from "../database/types/individual_tracker_games";
import { ProfileNotFoundError, InvalidReorderError } from "./errors";
import type {
  GetProfileRequest,
  GetProfileResponse,
  CreateProfileRequest,
  CreateProfileResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  AddGameRequest,
  AddGameResponse,
  RemoveGameRequest,
  RemoveGameResponse,
  ReorderGamesRequest,
  ReorderGamesResponse,
} from "./types";

export class IndividualTrackerService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getProfile(request: GetProfileRequest): Promise<GetProfileResponse> {
    const profiles = await this.databaseService.findIndividualTrackerProfilesByUserId(request.userId);

    if (profiles.length === 0) {
      return { profile: null, games: [] };
    }

    const [profile] = profiles;
    if (profile == null) {
      return { profile: null, games: [] };
    }

    const games = await this.databaseService.getIndividualTrackerGames(profile.ProfileId);

    return { profile, games };
  }

  async createProfile(request: CreateProfileRequest): Promise<CreateProfileResponse> {
    const nowEpoch = Math.floor(Date.now() / 1000);
    const profile: IndividualTrackerProfilesRow = {
      ProfileId: crypto.randomUUID(),
      UserId: request.userId,
      ActiveIdentityId: request.activeIdentityId ?? null,
      Name: (request.name?.trim() ?? "") || "default",
      IdleTimeoutHours: 1,
      AllowContinueAfterLogout: 0,
      CreatedAt: nowEpoch,
      UpdatedAt: nowEpoch,
    };

    await this.databaseService.createIndividualTrackerProfile(profile);

    return { profile };
  }

  async updateProfile(request: UpdateProfileRequest): Promise<UpdateProfileResponse> {
    const profile = await this.databaseService.getIndividualTrackerProfile(request.profileId);
    if (profile?.UserId !== request.userId) {
      throw new ProfileNotFoundError();
    }

    const updates: Partial<Pick<IndividualTrackerProfilesRow, "ActiveIdentityId" | "Name" | "UpdatedAt">> = {
      UpdatedAt: Math.floor(Date.now() / 1000),
    };

    const trimmedName = request.updates.name?.trim();
    if (trimmedName != null && trimmedName !== "") {
      updates.Name = trimmedName;
    }

    if (Object.prototype.hasOwnProperty.call(request.updates, "activeIdentityId")) {
      updates.ActiveIdentityId = request.updates.activeIdentityId ?? null;
    }

    await this.databaseService.updateIndividualTrackerProfile(request.profileId, updates);
    const updatedProfile = await this.databaseService.getIndividualTrackerProfile(request.profileId);
    if (updatedProfile == null) {
      throw new Error("Profile disappeared after update");
    }

    return { profile: updatedProfile };
  }

  async addGame(request: AddGameRequest): Promise<AddGameResponse> {
    const profile = await this.databaseService.getIndividualTrackerProfile(request.profileId);
    if (profile?.UserId !== request.userId) {
      throw new ProfileNotFoundError();
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const games = await this.databaseService.getIndividualTrackerGames(request.profileId);

    const existingGame = games.find((game) => game.MatchId === request.matchId);
    const nextGames: IndividualTrackerGamesRow[] =
      existingGame !== undefined
        ? games.map((game) =>
            game.MatchId === request.matchId
              ? {
                  ...game,
                  Included: 1 as const,
                  UpdatedAt: nowEpoch,
                }
              : game,
          )
        : [
            ...games,
            {
              ProfileId: request.profileId,
              MatchId: request.matchId,
              Position: games.length + 1,
              Included: 1 as const,
              AnnotationsJson: "{}",
              CreatedAt: nowEpoch,
              UpdatedAt: nowEpoch,
            },
          ];

    await this.databaseService.replaceIndividualTrackerGames(request.profileId, nextGames);
    const updatedGames = await this.databaseService.getIndividualTrackerGames(request.profileId);

    return { games: updatedGames };
  }

  async removeGame(request: RemoveGameRequest): Promise<RemoveGameResponse> {
    const profile = await this.databaseService.getIndividualTrackerProfile(request.profileId);
    if (profile?.UserId !== request.userId) {
      throw new ProfileNotFoundError();
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const games = await this.databaseService.getIndividualTrackerGames(request.profileId);

    const nextGames: IndividualTrackerGamesRow[] = games.map((game) =>
      game.MatchId === request.matchId
        ? {
            ...game,
            Included: 0 as const,
            UpdatedAt: nowEpoch,
          }
        : game,
    );

    await this.databaseService.replaceIndividualTrackerGames(request.profileId, nextGames);
    const updatedGames = await this.databaseService.getIndividualTrackerGames(request.profileId);

    return { games: updatedGames };
  }

  async reorderGames(request: ReorderGamesRequest): Promise<ReorderGamesResponse> {
    const profile = await this.databaseService.getIndividualTrackerProfile(request.profileId);
    if (profile?.UserId !== request.userId) {
      throw new ProfileNotFoundError();
    }

    const nowEpoch = Math.floor(Date.now() / 1000);
    const games = await this.databaseService.getIndividualTrackerGames(request.profileId);

    const gameByMatchId = new Map(games.map((game) => [game.MatchId, game]));
    const orderedMatchIdSet = new Set(request.orderedMatchIds);
    if (
      request.orderedMatchIds.length !== games.length ||
      orderedMatchIdSet.size !== games.length ||
      request.orderedMatchIds.some((matchId) => !gameByMatchId.has(matchId))
    ) {
      throw new InvalidReorderError("orderedMatchIds must include all existing games");
    }

    const reorderedGames: IndividualTrackerGamesRow[] = request.orderedMatchIds.map((matchId, index) => {
      const game = gameByMatchId.get(matchId);
      if (game == null) {
        throw new Error("Invalid game mapping");
      }

      return {
        ...game,
        Position: index + 1,
        UpdatedAt: nowEpoch,
      };
    });

    await this.databaseService.replaceIndividualTrackerGames(request.profileId, reorderedGames);
    const updatedGames = await this.databaseService.getIndividualTrackerGames(request.profileId);

    return { games: updatedGames };
  }
}
