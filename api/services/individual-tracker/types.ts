export interface UpdateProfileOptions {
  userId: string;
  profileId: string;
  name?: string;
  activeIdentityId?: string | null;
}
