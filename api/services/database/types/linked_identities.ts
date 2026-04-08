export type IdentityProvider = "xbox" | "twitch" | "discord";

export interface LinkedIdentitiesRow {
  IdentityId: string;
  UserId: string;
  Provider: IdentityProvider;
  ProviderUserId: string;
  Gamertag: string | null;
  TwitchId: string | null;
  IsActive: 0 | 1;
  CreatedAt: number;
  UpdatedAt: number;
}
