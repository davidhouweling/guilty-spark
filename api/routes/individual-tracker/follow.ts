import { z } from "zod";
import { parsePathParams } from "@guilty-spark/shared/base/request-parsing";
import { userTrackerViewStateContract } from "@guilty-spark/shared/contracts/durable-objects/user-tracker/management";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { trackerDirectoryContract } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { UserTrackerDO } from "../../durable-objects/user-tracker/user-tracker-do";
import type { RoutesRegisterHandler } from "../base/types";

const gamertagParamsSchema = z.object({ gamertag: z.string().min(1) });
const EMPTY_TRACKER_DIRECTORY = { trackers: [], liveTrackerId: null };

function getUserTrackerStub(env: Env, userId: string): DurableObjectStub<UserTrackerDO> {
  const doId = env.USER_TRACKER_DO.idFromName(userId);
  return env.USER_TRACKER_DO.get(doId);
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

      const stub = getUserTrackerStub(env, identity.UserId);
      const url = new URL("http://do/view-state");
      url.searchParams.set("userId", identity.UserId);

      const response = await stub.fetch(url.toString(), { method: "GET" });
      if (!response.ok) {
        throw new Error(`UserTrackerDO view-state request failed with status ${response.status.toString()}`);
      }

      const result = await userTrackerViewStateContract.fromResponse(response);
      return trackerDirectoryContract.toResponse(result.state?.directory ?? EMPTY_TRACKER_DIRECTORY, { noStore: true });
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

      const stub = getUserTrackerStub(env, identity.UserId);
      const url = new URL("http://do/websocket");
      url.searchParams.set("userId", identity.UserId);
      return await stub.fetch(
        new Request(url.toString(), {
          method: "GET",
          headers: {
            Upgrade: "websocket",
          },
        }),
      );
    } catch (error) {
      logService.error(error, new Map([["context", "Follow WebSocket error"]]));
      return new Response("Internal Server Error", { status: 500 });
    }
  });
};
