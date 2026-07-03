import * as Sentry from "@sentry/cloudflare";
import { parseJsonBody } from "@guilty-spark/shared/base/request-parsing";
import {
  userTrackerDirectoryMessageContract,
  type UserTrackerStatusResponse,
  type UserTrackerViewStateResponse,
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
  CloudflareWebSocketHibernationAdapter,
  type WebSocketHibernationAdapter,
} from "../../base/websocket-hibernation-adapter";
import { emptyTrackerDirectory, type UserTrackerInternalState } from "./types";

const USER_TRACKER_STATE_KEY = "userTrackerState";

export class UserTrackerDO implements DurableObject, Rpc.DurableObjectBranded {
  __DURABLE_OBJECT_BRAND = undefined as never;
  private readonly state: DurableObjectState;
  private readonly logService: LogService;
  private readonly webSocketAdapter: WebSocketHibernationAdapter;

  constructor(
    state: DurableObjectState,
    env: Env,
    installServices = installServicesImpl,
    webSocketAdapter: WebSocketHibernationAdapter = new CloudflareWebSocketHibernationAdapter(),
  ) {
    this.state = state;
    this.logService = installServices({ env }).logService;
    this.webSocketAdapter = webSocketAdapter;
  }

  public async fetch(request: Request): Promise<Response> {
    return await Sentry.withScope(async () => {
      const { pathname } = new URL(request.url);
      const action = pathname.split("/").pop();

      Sentry.setTag("durableObject", "UserTrackerDO");
      Sentry.setTag("action", action ?? "unknown");
      Sentry.setContext("request", {
        method: request.method,
        path: pathname,
      });

      try {
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
        Sentry.captureException(error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });
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

    const stored = await this.loadState();
    const directory = stored.viewState?.directory ?? emptyTrackerDirectory;
    const payload = userTrackerDirectoryMessageContract.serialize({
      type: "directory",
      directory,
    });

    return this.webSocketAdapter.upgrade(this.state, payload);
  }
}
