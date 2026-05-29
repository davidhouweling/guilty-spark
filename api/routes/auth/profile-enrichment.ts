import type { Services } from "../../services/install";
import type { XboxSessionProfile } from "../../services/auth/types";

type ProfileEnrichmentServices = Pick<Services, "xboxService" | "authService" | "logService">;

/**
 * Best-effort: resolve the signed-in user's Xbox profile from their Microsoft access
 * token and persist it onto the session. Shared by the OAuth callback (first login)
 * and the session route (lazy re-enrichment when an earlier attempt failed), so the
 * profile self-heals instead of staying empty for the whole session lifetime.
 *
 * Never throws — a failed lookup is logged and leaves the profile unset.
 */
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
      // profileUserToXboxUserInfo yields "Unknown" when the profile has no gamertag; treat that as absent.
      ...(xboxUser.gamertag !== "" && xboxUser.gamertag !== "Unknown" ? { xboxGamertag: xboxUser.gamertag } : {}),
    };
  } catch (error) {
    services.logService.error(error as Error, new Map([["message", "Failed to resolve Xbox profile"]]));
  }

  // Always record the attempt (even on failure) so the session route's lazy re-enrichment
  // runs at most once per session instead of on every request for unresolvable profiles.
  // Kept separate from the lookup so a transient persistence error doesn't discard a
  // profile we already resolved — the caller still gets it for this response.
  try {
    await services.authService.attachSessionProfile(sessionId, { ...profile, xboxProfileCheckedAt: checkedAt });
  } catch (error) {
    services.logService.error(error as Error, new Map([["message", "Failed to persist Xbox profile"]]));
  }

  return profile;
}
