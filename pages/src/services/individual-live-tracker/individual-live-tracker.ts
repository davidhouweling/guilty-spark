import { isRecord, isString } from "@guilty-spark/shared/base/json-readers";
import type {
  IndividualTrackerState,
  IndividualTrackerStateMessage,
} from "@guilty-spark/shared/individual-tracker/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerConnectionStatus,
  IndividualLiveTrackerService,
  IndividualTrackerStateListener,
  IndividualTrackerStatusListener,
  IndividualTrackerSubscription,
  StartTrackerRequest,
  StartTrackerResponse,
  StopTrackerResponse,
  TrackerListResponse,
  TrackerStatusResponse,
  TrackerSearchResult,
  TrackerRecentMatch,
} from "./types";

interface Config {
  readonly apiHost: string;
}

class RealIndividualTrackerConnection implements IndividualTrackerConnection {
  private readonly stateListeners = new Set<IndividualTrackerStateListener>();
  private readonly statusListeners = new Set<IndividualTrackerStatusListener>();
  private ws: WebSocket | null;
  private readonly onOffline: () => void;

  public constructor(ws: WebSocket) {
    this.ws = ws;
    this.onOffline = (): void => {
      this.ws?.close();
    };
    window.addEventListener("offline", this.onOffline);
  }

  public subscribe(listener: IndividualTrackerStateListener): IndividualTrackerSubscription {
    this.stateListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.stateListeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: IndividualTrackerStatusListener): IndividualTrackerSubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public disconnect(): void {
    window.removeEventListener("offline", this.onOffline);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stateListeners.clear();
    this.statusListeners.clear();
  }

  public handleStatus(status: IndividualTrackerConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public handleStateMessage(state: IndividualTrackerState): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  public attachWebSocket(ws: WebSocket): void {
    this.ws = ws;
    this.onWebSocketSetup(ws);
  }

  private onWebSocketSetup(ws: WebSocket): void {
    ws.addEventListener("open", () => {
      this.handleStatus("connected");
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (
          parsed != null &&
          typeof parsed === "object" &&
          "type" in parsed &&
          "data" in parsed &&
          (parsed as { type: unknown }).type === "state"
        ) {
          const message = parsed as IndividualTrackerStateMessage;
          const { status } = message.data;
          if (status === "stopped") {
            this.handleStatus("stopped");
          }
          this.handleStateMessage(message.data);
        }
      } catch {
        // ignore unparseable messages
      }
    });

    ws.addEventListener("close", (event: CloseEvent) => {
      if (event.code === 1000) {
        this.handleStatus("stopped");
      } else {
        this.handleStatus("disconnected", event.reason);
      }
    });

    ws.addEventListener("error", () => {
      this.handleStatus("error", "WebSocket connection failed");
    });
  }
}

function extractOptionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function parseRecentMatch(value: unknown): TrackerRecentMatch | null {
  if (!isRecord(value)) {
    return null;
  }

  const matchId = value.MatchId;
  if (!isString(matchId)) {
    return null;
  }

  const mapVariant = isRecord(value.MapVariant) ? value.MapVariant : null;
  const gameVariant = isRecord(value.GameVariant) ? value.GameVariant : null;

  const matchStartDate = isRecord(value.MatchStartDate) ? value.MatchStartDate : null;
  const matchEndDate = isRecord(value.MatchEndDate) ? value.MatchEndDate : null;

  return {
    matchId,
    startTime: matchStartDate != null ? extractOptionalString(matchStartDate.ISO8601Date) : null,
    endTime: matchEndDate != null ? extractOptionalString(matchEndDate.ISO8601Date) : null,
    outcome: typeof value.PlayerOutcome === "number" ? String(value.PlayerOutcome) : null,
    mapAssetId: mapVariant != null ? extractOptionalString(mapVariant.AssetId) : null,
    modeAssetId: gameVariant != null ? extractOptionalString(gameVariant.AssetId) : null,
  };
}

export class RealIndividualLiveTrackerService implements IndividualLiveTrackerService {
  private readonly apiHost: string;

  public constructor({ apiHost }: Config) {
    this.apiHost = apiHost;
  }

  private async proxyHalo(method: string, args: unknown[]): Promise<unknown> {
    const response = await fetch(`${this.apiHost}/proxy/halo-infinite`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, args }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const body = await response.json<{ result?: unknown }>();
    return body.result;
  }

  public async startTracker(opts: StartTrackerRequest): Promise<StartTrackerResponse> {
    const response = await fetch(`${this.apiHost}/api/individual-live-tracker/start`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });

    return response.json<StartTrackerResponse>();
  }

  public async stopTracker(trackerId: string): Promise<StopTrackerResponse> {
    const response = await fetch(`${this.apiHost}/api/individual-live-tracker/${encodeURIComponent(trackerId)}/stop`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    return response.json<StopTrackerResponse>();
  }

  public async searchGamertag(query: string): Promise<TrackerSearchResult | null> {
    const normalized = query.trim();
    if (normalized === "") {
      return null;
    }

    const userResult = await this.proxyHalo("getUser", [normalized]);
    if (!isRecord(userResult) || !isString(userResult.gamertag) || !isString(userResult.xuid)) {
      return null;
    }

    let rankLabel: string | null = null;
    let csrLabel: string | null = null;

    try {
      const serviceRecordResult = await this.proxyHalo("getUserServiceRecord", [`xuid(${userResult.xuid})`]);
      if (isRecord(serviceRecordResult)) {
        const ranked = isRecord(serviceRecordResult.RankedArenaStats) ? serviceRecordResult.RankedArenaStats : null;
        if (ranked != null) {
          if (typeof ranked.CurrentRank === "string") {
            rankLabel = ranked.CurrentRank;
          }
          if (typeof ranked.CurrentCsr === "number") {
            csrLabel = ranked.CurrentCsr.toString();
          }
        }
      }
    } catch {
      // Service record preview is best-effort.
    }

    return {
      gamertag: userResult.gamertag,
      xuid: userResult.xuid,
      rankLabel,
      csrLabel,
    };
  }

  public async getRecentMatches(xuid: string, start: number, count: number): Promise<readonly TrackerRecentMatch[]> {
    const result = await this.proxyHalo("getPlayerMatches", [xuid, 0, count, start]);
    if (!Array.isArray(result)) {
      return [];
    }

    const mapped = result
      .map((item) => parseRecentMatch(item))
      .filter((match): match is TrackerRecentMatch => match !== null);

    return mapped;
  }

  public async addMatchToTracker(trackerId: string, matchId: string): Promise<void> {
    const response = await fetch(
      `${this.apiHost}/api/individual-live-tracker/${encodeURIComponent(trackerId)}/games:add`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }
  }

  public async getTrackers(userId: string): Promise<TrackerListResponse> {
    const listResponse = await fetch(
      `${this.apiHost}/api/individual-live-tracker/${encodeURIComponent(userId)}/trackers`,
    );
    const list = await listResponse.json<{ trackers: TrackerListResponse["trackers"] }>();

    const trackerIds = list.trackers.map((t) => t.trackerId);
    const statuses = await this.getTrackerStatuses(userId, trackerIds);

    return { trackers: list.trackers, statuses };
  }

  private async getTrackerStatuses(
    userId: string,
    trackerIds: readonly string[],
  ): Promise<Record<string, IndividualTrackerState | null>> {
    if (trackerIds.length === 0) {
      return {};
    }

    const params = new URLSearchParams({ trackerIds: trackerIds.join(",") });
    const response = await fetch(
      `${this.apiHost}/api/individual-live-tracker/${encodeURIComponent(userId)}/statuses?${params.toString()}`,
    );

    const data = await response.json<{ statuses: Record<string, IndividualTrackerState | null> }>();
    return data.statuses;
  }

  public connectToTracker(userId: string, trackerId: string): IndividualTrackerConnection {
    const wsHost = this.apiHost.replace(/^https?:\/\//, (match) => (match.startsWith("https") ? "wss://" : "ws://"));
    const ws = new WebSocket(
      `${wsHost}/ws/individual-tracker/${encodeURIComponent(userId)}/${encodeURIComponent(trackerId)}`,
    );

    const connection = new RealIndividualTrackerConnection(ws);
    connection.attachWebSocket(ws);
    return connection;
  }

  public connectToActiveTracker(userId: string): IndividualTrackerConnection {
    const wsHost = this.apiHost.replace(/^https?:\/\//, (match) => (match.startsWith("https") ? "wss://" : "ws://"));
    const ws = new WebSocket(`${wsHost}/ws/individual-tracker/${encodeURIComponent(userId)}/active`);

    const connection = new RealIndividualTrackerConnection(ws);
    connection.attachWebSocket(ws);
    return connection;
  }

  public async getActiveTrackerState(userId: string): Promise<TrackerStatusResponse> {
    const response = await fetch(`${this.apiHost}/api/individual-live-tracker/${encodeURIComponent(userId)}/active`);

    return response.json<TrackerStatusResponse>();
  }
}
