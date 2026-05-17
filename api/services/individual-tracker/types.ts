import type { IndividualTrackerProfilesRow } from "../database/types/individual_tracker_profiles";
import type { IndividualTrackerGamesRow } from "../database/types/individual_tracker_games";

export interface GetProfileRequest {
  userId: string;
}

export interface GetProfileResponse {
  profile: IndividualTrackerProfilesRow | null;
  games: IndividualTrackerGamesRow[];
}

export interface CreateProfileRequest {
  userId: string;
  name?: string;
  activeIdentityId?: string | null;
}

export interface CreateProfileResponse {
  profile: IndividualTrackerProfilesRow;
}

export interface UpdateProfileRequest {
  userId: string;
  profileId: string;
  updates: {
    name?: string;
    activeIdentityId?: string | null;
  };
}

export interface UpdateProfileResponse {
  profile: IndividualTrackerProfilesRow;
}

export interface AddGameRequest {
  userId: string;
  profileId: string;
  matchId: string;
}

export interface AddGameResponse {
  games: IndividualTrackerGamesRow[];
}

export interface RemoveGameRequest {
  userId: string;
  profileId: string;
  matchId: string;
}

export interface RemoveGameResponse {
  games: IndividualTrackerGamesRow[];
}

export interface ReorderGamesRequest {
  userId: string;
  profileId: string;
  orderedMatchIds: string[];
}

export interface ReorderGamesResponse {
  games: IndividualTrackerGamesRow[];
}
