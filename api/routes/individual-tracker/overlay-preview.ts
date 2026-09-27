import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import {
  overlayPreviewContract,
  overlayPreviewQuerySchema,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
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

      const session = await authService.validateSession(request);
      const sessionXuid = session?.isExpired === false ? session.xboxXuid : undefined;
      const sessionGamertag = session?.isExpired === false ? session.xboxGamertag : undefined;
      const identity: PreviewIdentity =
        session != null && sessionXuid != null && sessionGamertag != null
          ? { xuid: sessionXuid, gamertag: sessionGamertag, userId: session.userId }
          : DEMO_IDENTITY;

      let streamerSettings: StreamerViewSettings | undefined;
      if (identity.userId != null) {
        streamerSettings = await individualTrackerService.getSettingsForView(identity.userId);
      }

      const configuredSlots = streamerSettings?.visibleSections?.statsHighlightSlots?.filter(
        isIndividualStatsHighlightOption,
      );
      const statsHighlightSlots: readonly IndividualStatsHighlightOption[] = configuredSlots ?? DEFAULT_SLOTS;

      const view = await buildOverlayPreviewView({
        haloService,
        logService,
        xuid: identity.xuid,
        gamertag: identity.gamertag,
        mode,
        statsHighlightSlots,
        ...(streamerSettings !== undefined ? { streamerSettings } : {}),
      });

      return overlayPreviewContract.toResponse({ view, mode, isExample: identity.userId === null }, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Overlay preview error"]]));
      return errorContract.toResponse({ error: "Failed to build overlay preview" }, { status: 500, noStore: true });
    }
  });
};
