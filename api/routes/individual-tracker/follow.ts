import { z } from "zod";
import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import {
  trackerDirectoryContract,
  trackerDirectoryMessageContract,
} from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { IndividualTrackersRow } from "../../services/database/types/individual_trackers";
import type { Services } from "../../services/install";
import type { RoutesRegisterHandler } from "../base/types";
import { computeAccumulated, fetchTrackerDoViewState } from "./mapper";

const gamertagParamsSchema = z.object({ gamertag: z.string().min(1) });

function isNonStopped(row: IndividualTrackersRow): boolean {
  return row.Status !== "stopped";
}

async function buildDirectory(env: Env, userId: string, services: Services): Promise<TrackerDirectory> {
  const allTrackers = await services.databaseService.findIndividualTrackersByUserId(userId);
  const nonStopped = allTrackers.filter(isNonStopped);

  const [entries, streamerSettings] = await Promise.all([
    Promise.all(
      nonStopped.map(async (row): Promise<TrackerDirectoryEntry> => {
        const doState = await fetchTrackerDoViewState(env, row.UserId, row.TrackerId);
        const matches = doState?.matches ?? [];
        return {
          trackerId: row.TrackerId,
          gamertag: row.Gamertag,
          status: row.Status,
          isLive: row.IsLive === 1,
          accumulated: computeAccumulated(matches),
        };
      }),
    ),
    services.individualTrackerService.getSettingsForView(userId),
  ]);

  return {
    trackers: entries,
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
      server.send(trackerDirectoryMessageContract.serialize({ type: "directory", directory }));
      // Push-on-change (tracker goes live, new tracker added) is deferred to a future PR
      // that subscribes to individual tracker DOs. For now clients get the snapshot on
      // connect and can reconnect to refresh.

      return new Response(null, { status: 101, webSocket: client });
    } catch (error) {
      logService.error(error, new Map([["context", "Follow WebSocket error"]]));
      return new Response("Internal Server Error", { status: 500 });
    }
  });
};
