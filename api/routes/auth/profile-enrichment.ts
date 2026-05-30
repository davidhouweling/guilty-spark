import type { Services } from "../../services/install";
import type { XboxSessionProfile } from "../../services/auth/types";

type ProfileEnrichmentServices = Pick<Services, "xboxService" | "authService" | "logService">;

export async function enrichSessionProfile(
  services: ProfileEnrichmentServices,
  sessionId: string,
  checkedAt: number,
  accessToken: string,
): Promise<XboxSessionProfile | null> {
  let profile: XboxSessionProfile | null = null;
  try {
    const xboxUser = await services.xboxService.getUserFromMicrosoftAccessToken(accessToken);
    profile = {
      xboxXuid: xboxUser.xuid,
      ...(xboxUser.avatarUrl != null ? { avatarUrl: xboxUser.avatarUrl } : {}),
      ...(xboxUser.gamertag !== "" && xboxUser.gamertag !== "Unknown" ? { xboxGamertag: xboxUser.gamertag } : {}),
    };
  } catch (error) {
    services.logService.error(error as Error, new Map([["message", "Failed to resolve Xbox profile"]]));
  }

  try {
    await services.authService.attachSessionProfile(sessionId, { ...profile, xboxProfileCheckedAt: checkedAt });
  } catch (error) {
    services.logService.error(error as Error, new Map([["message", "Failed to persist Xbox profile"]]));
  }

  return profile;
}
