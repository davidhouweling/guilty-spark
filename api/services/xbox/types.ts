export interface TokenInfo {
  XSTSToken: string;
  userHash: string;
  expiresOn: Date;
}

export interface ProfileUser {
  id: string;
  hostId: string;
  settings: { id: "GameDisplayName" | "GameDisplayPicRaw" | "Gamerscore" | "Gamertag"; value: string }[];
  isSponsoredUser: boolean;
}

export interface XboxUserInfo {
  xuid: string;
  gamertag: string;
}
