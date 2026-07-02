import { z } from "zod";
import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import {
  trackerDirectoryContract,
  trackerDirectoryMessageContract,
} from "@guilty-spark/shared/contracts/individual-tracker/follow";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";
import type { Services } from "../../services/install";
import type { RoutesRegisterHandler } from "../base/types";
import { fetchTrackerDoViewState, toTrackerView } from "./mapper";

const gamertagParamsSchema = z.object({ gamertag: z.string().min(1) });
const FOLLOW_WS_POLL_INTERVAL_MS = 3000;

function isNonStopped(row: IndividualTrackersRow): boolean {
  return row.Status !== "stopped";
}

async function buildDirectory(env: Env, userId: string, services: Services): Promise<TrackerDirectory> {
  const [allTrackers, streamerSettings] = await Promise.all([
    services.databaseService.findIndividualTrackersByUserId(userId),
    services.individualTrackerService.getSettingsForView(userId),
  ]);

  const nonStopped = allTrackers.filter(isNonStopped);
  const statsHighlightSlots =
    streamerSettings.visibleSections?.statsHighlightSlots ??
    DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS.slice(0, INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT);

  const entries = await Promise.all(
    nonStopped.map(async (row): Promise<TrackerDirectoryEntry> => {
      const doState = await fetchTrackerDoViewState(env, row.UserId, row.TrackerId, statsHighlightSlots);
      return toTrackerView(row, doState);
    }),
  );

  const liveTracker = entries.find((entry) => entry.isLive);
  const firstActiveTracker = entries.find((entry) => entry.status === "active");
  const liveTrackerId = liveTracker?.trackerId ?? firstActiveTracker?.trackerId ?? null;

  return {
    trackers: entries,
    liveTrackerId,
    streamerSettings: Object.keys(streamerSettings).length > 0 ? streamerSettings : undefined,
  };
}

export const trackerFollowRoutesRegisterHandler: RoutesRegisterHandler = (router, installServices) => {
  router.get("/u/:gamertag/view", async (request, env: Env) => {
    const services = installServices({ env });
    const { databaseService, logService } = services;

    try {
      const parsedParams = parsePathParams(request.params, gamertagParamsSchema, "Invalid gamertag");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { gamertag } = parsedParams.data;

      const identity = await databaseService.findActiveXboxIdentityByGamertag(gamertag);
      if (identity == null) {
        return errorContract.toResponse({ error: "Gamertag not found" }, { status: 404, noStore: true });
      }

      const directory = await buildDirectory(env, identity.UserId, services);
      return trackerDirectoryContract.toResponse(directory, { noStore: true });
    } catch (error) {
      logService.error(error, new Map([["context", "Follow view error"]]));
      return errorContract.toResponse({ error: "Failed to fetch follow directory" }, { status: 500, noStore: true });
    }
  });

  router.get("/u/:gamertag/ws", async (request, env: Env) => {
    const services = installServices({ env });
    const { databaseService, logService } = services;

    try {
      const parsedParams = parsePathParams(request.params, gamertagParamsSchema, "Invalid gamertag");
      if (!parsedParams.success) {
        return parsedParams.response;
      }
      const { gamertag } = parsedParams.data;

      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const identity = await databaseService.findActiveXboxIdentityByGamertag(gamertag);
      if (identity == null) {
        return errorContract.toResponse({ error: "Gamertag not found" }, { status: 404, noStore: true });
      }

      const directory = await buildDirectory(env, identity.UserId, services);

      const { 0: client, 1: server } = new WebSocketPair();
      server.accept();
      let lastPayload = trackerDirectoryMessageContract.serialize({ type: "directory", directory });
      server.send(lastPayload);

      const pollInterval = setInterval(() => {
        void (async (): Promise<void> => {
          try {
            const nextDirectory = await buildDirectory(env, identity.UserId, services);
            const nextPayload = trackerDirectoryMessageContract.serialize({
              type: "directory",
              directory: nextDirectory,
            });
            if (nextPayload === lastPayload) {
              return;
            }
            lastPayload = nextPayload;
            server.send(nextPayload);
          } catch (pollError) {
            logService.error(pollError, new Map([["context", "Follow WebSocket poll error"]]));
          }
        })();
      }, FOLLOW_WS_POLL_INTERVAL_MS);

      const stopPolling = (): void => {
        clearInterval(pollInterval);
      };

      server.addEventListener("close", stopPolling);
      server.addEventListener("error", stopPolling);

      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      logService.error(error, new Map([["context", "Follow WebSocket error"]]));
      return new Response("Internal Server Error", { status: 500 });
    }
  });
};
