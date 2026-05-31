export interface UpdateProfileOptions {
  userId: string;
  profileId: string;
  name?: string;
  activeIdentityId?: string | null;
}

export interface CreateTrackerOptions {
  userId: string;
  gamertag: string;
  xuid: string;
}
