import { errorContract } from "@guilty-spark/shared/contracts/error";
import type { TrackerViewResponse } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { trackerViewContract } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { RealTrackerViewConnection } from "./view-connection";
import type { IndividualTrackerViewService, TrackerViewConnection } from "./view-types";

interface IndividualTrackerViewServiceOpts {
  readonly apiHost: string;
}

export class RealIndividualTrackerViewService implements IndividualTrackerViewService {
  private readonly apiHost: string;

  public constructor({ apiHost }: IndividualTrackerViewServiceOpts) {
    this.apiHost = apiHost;
  }

  private buildUrl(path: string): string {
    const baseUrl = this.apiHost.endsWith("/") ? this.apiHost.slice(0, -1) : this.apiHost;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  private async readError(response: Response): Promise<Error> {
    const body = await response.text();
    if (body !== "") {
      try {
        const parsed = errorContract.safeParse(JSON.parse(body));
        if (parsed.success && parsed.data.error !== "") {
          return new Error(parsed.data.error);
        }
        return new Error(`Request failed (${String(response.status)})`);
      } catch {
        return new Error(body);
      }
    }

    return new Error(`Request failed (${String(response.status)})`);
  }

  public async getView(trackerId: string): Promise<TrackerViewResponse> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/view`), {
      credentials: "include",
      method: "GET",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerViewContract.fromResponse(response);
  }

  public connect(trackerId: string): TrackerViewConnection {
    const apiUrl = new URL(this.apiHost);
    const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${apiUrl.host}/api/individual-tracker/${encodeURIComponent(trackerId)}/ws`;

    const ws = new WebSocket(wsUrl);
    const connection = new RealTrackerViewConnection(ws);

    connection.handleStatus("connecting");

    ws.onopen = (): void => {
      connection.handleStatus("connected");
    };

    ws.onmessage = (event: MessageEvent): void => {
      if (typeof event.data !== "string") {
        return;
      }

      connection.handleRaw(event.data);
    };

    ws.onerror = (ev): void => {
      console.error("WebSocket error", ev);
      connection.handleStatus("error");
    };

    ws.onclose = (event: CloseEvent): void => {
      if (event.code === 1000 && event.reason === "Tracker stopped") {
        connection.handleStatus("stopped");
        return;
      }

      if (event.code === 1000) {
        connection.handleStatus("disconnected");
        return;
      }

      connection.handleStatus("error", event.reason || undefined);
    };

    return connection;
  }
}
