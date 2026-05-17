export interface IndividualTrackerProfile {
  ProfileId: string;
  UserId: string;
  ActiveIdentityId: string | null;
  Name: string;
  CreatedAt: number;
  UpdatedAt: number;
}

export interface IndividualTrackerGame {
  ProfileId: string;
  MatchId: string;
  Position: number;
  Included: 0 | 1;
  AnnotationsJson: string;
  CreatedAt: number;
  UpdatedAt: number;
}

export interface IndividualTrackerProfileResponse {
  profile: IndividualTrackerProfile | null;
  games: IndividualTrackerGame[];
}

export interface IndividualTrackerCreateProfileRequest {
  name?: string;
  activeIdentityId?: string | null;
}

export interface IndividualTrackerCreateProfileResponse {
  profile: IndividualTrackerProfile;
}

export interface IndividualTrackerUpdateProfileRequest {
  profileId: string;
  name?: string;
  activeIdentityId?: string | null;
}

export interface IndividualTrackerUpdateProfileResponse {
  profile: IndividualTrackerProfile;
}

export interface IndividualTrackerMutateGamesRequest {
  profileId: string;
  matchId: string;
}

export interface IndividualTrackerReorderGamesRequest {
  profileId: string;
  orderedMatchIds: string[];
}

export interface IndividualTrackerGamesResponse {
  games: IndividualTrackerGame[];
}

export interface IndividualTrackerService {
  getProfile(): Promise<IndividualTrackerProfileResponse>;
  createProfile(request: IndividualTrackerCreateProfileRequest): Promise<IndividualTrackerCreateProfileResponse>;
  updateProfile(request: IndividualTrackerUpdateProfileRequest): Promise<IndividualTrackerUpdateProfileResponse>;
  addGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse>;
  removeGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse>;
  reorderGames(request: IndividualTrackerReorderGamesRequest): Promise<IndividualTrackerGamesResponse>;
}
