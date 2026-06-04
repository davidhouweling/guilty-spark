import { errorContract } from "@guilty-spark/shared/contracts/error";
import { trackerDirectoryContract } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { trackerViewContract } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TrackerViewResponse } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { RealDirectoryConnection } from "./follow-connection";
import type { DirectoryConnection, FollowLiveService } from "./follow-types";

interface FollowLiveServiceOpts {
  readonly apiHost: string;
}

export class RealFollowLiveService implements FollowLiveService {
  private readonly apiHost: string;

  public constructor({ apiHost }: FollowLiveServiceOpts) {
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

  public async getDirectory(gamertag: string): Promise<TrackerDirectory> {
    const response = await fetch(this.buildUrl(`/u/${encodeURIComponent(gamertag)}/view`), {
      method: "GET",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerDirectoryContract.fromResponse(response);
  }

  public connectDirectory(gamertag: string): DirectoryConnection {
    const apiUrl = new URL(this.apiHost);
    const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${apiUrl.host}/u/${encodeURIComponent(gamertag)}/ws`;

    const ws = new WebSocket(wsUrl);
    const connection = new RealDirectoryConnection(ws);

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
      if (event.code === 1000) {
        connection.handleStatus("disconnected");
        return;
      }

      connection.handleStatus("error", event.reason || undefined);
    };

    return connection;
  }

  public async getTrackerView(trackerId: string): Promise<TrackerViewResponse> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/view`), {
      method: "GET",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerViewContract.fromResponse(response);
  }
}
