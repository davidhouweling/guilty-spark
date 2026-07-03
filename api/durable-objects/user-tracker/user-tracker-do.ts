import { parseJsonBody } from "@guilty-spark/shared/base/request-parsing";
import {
  userTrackerDirectoryMessageContract,
  userTrackerStatusContract,
  userTrackerViewStateContract,
} from "@guilty-spark/shared/contracts/durable-objects/user-tracker/management";
import {
  trackerChangedPayloadSchema,
  userTrackerNudgeContract,
} from "@guilty-spark/shared/contracts/durable-objects/user-tracker/nudge";
import { installServices as installServicesImpl } from "../../services/install";
import type { LogService } from "../../services/log/types";
import {
  emptyTrackerDirectory,
  type UserTrackerInternalState,
  type UserTrackerStatusResponse,
  type UserTrackerViewStateResponse,
} from "./types";

const USER_TRACKER_STATE_KEY = "userTrackerState";

export class UserTrackerDO implements DurableObject, Rpc.DurableObjectBranded {
  __DURABLE_OBJECT_BRAND = undefined as never;
  private readonly state: DurableObjectState;
  private readonly logService: LogService;

  constructor(state: DurableObjectState, env: Env, installServices = installServicesImpl) {
    this.state = state;
    this.logService = installServices({ env }).logService;
  }

  public async fetch(request: Request): Promise<Response> {
    try {
      const { pathname } = new URL(request.url);

      switch (`${request.method} ${pathname}`) {
        case "GET /status": {
          return await this.handleStatus();
        }
        case "GET /view-state": {
          return await this.handleViewState();
        }
        case "POST /nudge": {
          return await this.handleNudge(request);
        }
        case "GET /websocket": {
          return await this.handleWebSocket(request);
        }
        default: {
          return new Response("Not Found", { status: 404 });
        }
      }
    } catch (error) {
      this.logService.error(error, new Map([["context", "UserTrackerDO fetch error"]]));
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  private async loadState(): Promise<UserTrackerInternalState> {
    const stored = await this.state.storage.get<UserTrackerInternalState>(USER_TRACKER_STATE_KEY);
    if (stored != null) {
      return stored;
    }

    return {
      state: null,
      viewState: null,
    };
  }

  private async handleStatus(): Promise<Response> {
    const stored = await this.loadState();
    const response: UserTrackerStatusResponse = {
      state: stored.state,
    };
    return userTrackerStatusContract.toResponse(response, { noStore: true });
  }

  private async handleViewState(): Promise<Response> {
    const stored = await this.loadState();
    const response: UserTrackerViewStateResponse = {
      state: stored.viewState,
    };
    return userTrackerViewStateContract.toResponse(response, { noStore: true });
  }

  private async handleNudge(request: Request): Promise<Response> {
    const parsedBody = await parseJsonBody(request, trackerChangedPayloadSchema, "Invalid user tracker nudge payload");
    if (!parsedBody.success) {
      return parsedBody.response;
    }

    return userTrackerNudgeContract.toResponse({ success: true }, { noStore: true });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();

    const stored = await this.loadState();
    const directory = stored.viewState?.directory ?? emptyTrackerDirectory;
    const payload = userTrackerDirectoryMessageContract.serialize({
      type: "directory",
      directory,
    });
    if (server.readyState === WebSocket.OPEN) {
      server.send(payload);
    }

    return new Response(null, { status: 101, webSocket: client });
  }
}
