export interface UserSessionsRow {
  SessionId: string;
  UserId: string;
  AccessToken: string;
  RefreshToken: string | null;
  ExpiresAt: number;
  CreatedAt: number;
  LastRefreshedAt: number | null;
  AuthMetadataJson: string;
}
