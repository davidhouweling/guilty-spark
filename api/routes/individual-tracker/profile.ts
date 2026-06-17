import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  trackerProfileContract,
  updateTrackerProfileRequestSchema,
} from "@guilty-spark/shared/contracts/individual-tracker/profile";
import { parseJsonBody } from "@guilty-spark/shared/base/request-parsing";
import { IdentityNotOwnedError, ProfileNotFoundError } from "../../services/individual-tracker/errors";
import type { UpdateProfileOptions } from "../../services/individual-tracker/types";
import type { RoutesRegisterHandler } from "../base/types";
import { requireSession } from "../base/require-session";
import { toTrackerProfile } from "./mapper";

export const trackerProfileRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/api/individual-tracker/profile", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const profile = await individualTrackerService.getOrCreateProfile(auth.session.userId);

      return trackerProfileContract.toResponse({ profile: toTrackerProfile(profile) }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["message", "Individual tracker profile get error"]]));
      return errorContract.toResponse({ error: "Failed to fetch profile" }, { status: 500, noStore: true });
    }
  });

  router.patch("/api/individual-tracker/profile", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, individualTrackerService, logService } = services;

    try {
      const auth = await requireSession(request, authService);
      if (!auth.ok) {
        return auth.response;
      }

      const parsed = await parseJsonBody(request, updateTrackerProfileRequestSchema, "Invalid profile update request");
      if (!parsed.success) {
        return parsed.response;
      }

      const options: UpdateProfileOptions = { userId: auth.session.userId, profileId: parsed.data.profileId };
      if (parsed.data.name !== undefined) {
        options.name = parsed.data.name;
      }
      if (parsed.data.activeIdentityId !== undefined) {
        options.activeIdentityId = parsed.data.activeIdentityId;
      }

      try {
        const profile = await individualTrackerService.updateProfile(options);
        return trackerProfileContract.toResponse({ profile: toTrackerProfile(profile) }, { noStore: true });
      } catch (error) {
        if (error instanceof ProfileNotFoundError) {
          return errorContract.toResponse({ error: "Profile not found" }, { status: 404, noStore: true });
        }
        if (error instanceof IdentityNotOwnedError) {
          return errorContract.toResponse(
            { error: "Active identity is not linked to this user" },
            { status: 400, noStore: true },
          );
        }
        throw error;
      }
    } catch (error) {
      logService.error(error, new Map([["message", "Individual tracker profile update error"]]));
      return errorContract.toResponse({ error: "Failed to update profile" }, { status: 500, noStore: true });
    }
  });
};
