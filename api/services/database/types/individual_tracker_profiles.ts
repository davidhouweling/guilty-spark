export interface IndividualTrackerProfilesRow {
  ProfileId: string;
  UserId: string;
  ActiveIdentityId: string | null;
  Name: string;
  IdleTimeoutHours: number;
  AllowContinueAfterLogout: number;
  CreatedAt: number;
  UpdatedAt: number;
}
