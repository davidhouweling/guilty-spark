import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  overlayPreviewContract,
  overlayPreviewQuerySchema,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
  INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT,
  isIndividualStatsHighlightOption,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type {
  StreamerViewSettings,
  IndividualStatsHighlightOption,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  OVERLAY_PREVIEW_DEMO_GAMERTAG,
  OVERLAY_PREVIEW_DEMO_XUID,
  buildOverlayPreviewView,
} from "../../individual-tracker/overlay-preview";
import type { RoutesRegisterHandler } from "../base/types";
import type { AuthService } from "../../services/auth/auth";
import type { LogService } from "../../services/log/types";

interface PreviewIdentity {
  readonly xuid: string;
  readonly gamertag: string;
  readonly userId: string | null;
}

const DEFAULT_SLOTS = DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS.slice(
  0,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
);

const DEMO_IDENTITY: PreviewIdentity = {
  xuid: OVERLAY_PREVIEW_DEMO_XUID,
  gamertag: OVERLAY_PREVIEW_DEMO_GAMERTAG,
  userId: null,
};

async function resolvePreviewIdentity(
  request: Request,
  authService: AuthService,
  logService: LogService,
): Promise<{ identity: PreviewIdentity; clearCookie: boolean }> {
  const session = await authService.validateSession(request);
  if (session == null) {
    return { identity: DEMO_IDENTITY, clearCookie: false };
  }

  if (session.isExpired) {
    try {
      const refreshed = await authService.refreshSession(session);
      if (refreshed == null) {
        return { identity: DEMO_IDENTITY, clearCookie: true };
      }
    } catch (error) {
      logService.warn(error, new Map([["context", "Overlay preview: refreshSession failed"]]));
      return { identity: DEMO_IDENTITY, clearCookie: true };
    }
  }

  if (session.xboxXuid == null || session.xboxGamertag == null) {
    return { identity: DEMO_IDENTITY, clearCookie: false };
  }
  return {
    identity: { xuid: session.xboxXuid, gamertag: session.xboxGamertag, userId: session.userId },
    clearCookie: false,
  };
}

export const trackerOverlayPreviewRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  // Deliberately session-optional and takes no gamertag: callers only ever get their own data or
  // the shared demo identity, so this cannot be used to read another user's history.
  router.get("/api/individual-tracker/overlay-preview", async (request, env: Env) => {
    const services = installServices({ env });
    const { authService, haloService, individualTrackerService, logService } = services;

    try {
      const parsedQuery = parseQueryParams(new URL(request.url), overlayPreviewQuerySchema, "Invalid preview mode");
      if (!parsedQuery.success) {
        return parsedQuery.response;
      }
      const { mode } = parsedQuery.data;

      const { identity, clearCookie } = await resolvePreviewIdentity(request, authService, logService);

      let streamerSettings: StreamerViewSettings | undefined;
      if (identity.userId != null) {
        streamerSettings = await individualTrackerService.getSettingsForView(identity.userId);
      }

      const configuredSlots = streamerSettings?.visibleSections?.statsHighlightSlots?.filter(
        isIndividualStatsHighlightOption,
      );
      const statsHighlightSlots: readonly IndividualStatsHighlightOption[] = (configuredSlots ?? DEFAULT_SLOTS).slice(
        0,
        INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT,
      );

      const view = await buildOverlayPreviewView({
        haloService,
        logService,
        xuid: identity.xuid,
        gamertag: identity.gamertag,
        mode,
        statsHighlightSlots,
        ...(streamerSettings !== undefined ? { streamerSettings } : {}),
      });

      const response = overlayPreviewContract.toResponse(
        { view, mode, isExample: identity.userId === null },
        { noStore: true },
      );
      if (clearCookie) {
        authService.clearSessionCookie(response);
      }
      return response;
    } catch (error) {
      logService.error(error, new Map([["context", "Overlay preview error"]]));
      return errorContract.toResponse({ error: "Failed to build overlay preview" }, { status: 500, noStore: true });
    }
  });
};
