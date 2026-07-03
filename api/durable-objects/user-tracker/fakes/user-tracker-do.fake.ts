import type {
  UserTrackerStatusResponse,
  UserTrackerViewStateResponse,
} from "@guilty-spark/shared/contracts/durable-objects/user-tracker/management";
import type { UserTrackerNudgeResponse } from "@guilty-spark/shared/contracts/durable-objects/user-tracker/nudge";
import type { UserTrackerDO } from "../user-tracker-do";
import { aFakeDurableObjectId } from "../../../base/fakes/do.fake";

export interface FakeUserTrackerDOOpts {
  statusResponse?: UserTrackerStatusResponse;
  viewStateResponse?: UserTrackerViewStateResponse;
  nudgeResponse?: UserTrackerNudgeResponse;
  shouldThrowError?: boolean;
  errorMessage?: string;
}

export type FakeUserTrackerDO = DurableObjectStub<UserTrackerDO> & Rpc.DurableObjectBranded;

export function aFakeUserTrackerDOWith(opts: FakeUserTrackerDOOpts = {}): FakeUserTrackerDO {
  const statusResponse: UserTrackerStatusResponse = opts.statusResponse ?? { state: null };
  const viewStateResponse: UserTrackerViewStateResponse = opts.viewStateResponse ?? { state: null };
  const nudgeResponse: UserTrackerNudgeResponse = opts.nudgeResponse ?? { success: true };
  const { shouldThrowError = false, errorMessage = "Fake DO error" } = opts;

  const fetchMock: FakeUserTrackerDO["fetch"] = async (input) => {
    if (shouldThrowError) {
      throw new Error(errorMessage);
    }

    let urlString: string;
    if (typeof input === "string") {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.href;
    } else {
      urlString = input.url;
    }

    const path = new URL(urlString).pathname;

    switch (path) {
      case "/status": {
        return Promise.resolve(
          new Response(JSON.stringify(statusResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      case "/view-state": {
        return Promise.resolve(
          new Response(JSON.stringify(viewStateResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      case "/nudge": {
        return Promise.resolve(
          new Response(JSON.stringify(nudgeResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      case "/websocket": {
        return Promise.resolve(new Response(null, { status: 200, headers: { "x-fake-upgrade": "websocket" } }));
      }
      default: {
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      }
    }
  };

  return {
    ["__DURABLE_OBJECT_BRAND"]: undefined as never,
    fetch: fetchMock,
    connect: (): Socket => {
      throw new Error("Socket connections not supported in fake");
    },
    id: aFakeDurableObjectId(),
  };
}
