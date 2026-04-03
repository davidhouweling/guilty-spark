import type { LiveTrackerIdentity, LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { Services } from "../../services/types";
import type {
  LiveTrackerConnection,
  LiveTrackerConnectionStatus,
  LiveTrackerSubscription,
} from "../../services/live-tracker/types";
import type { LiveTrackerParams, LiveTrackerSnapshot, LiveTrackerStore } from "./live-tracker-store";
import type { LiveTrackerViewModel } from "./types";
import { toLiveTrackerStateRenderModel } from "./state-render-model";

interface Config {
  readonly services: Services;
  readonly getUrl: () => URL;
  readonly store: LiveTrackerStore;
}

export class LiveTrackerPresenter {
  public static readonly usageText = "Usage: /tracker?server=123&queue=1 or /tracker?gamertag=YourGamertag";

  private readonly config: Config;

  private isDisposed = false;
  private connection: LiveTrackerConnection | null = null;
  private messageSubscription: LiveTrackerSubscription | null = null;
  private statusSubscription: LiveTrackerSubscription | null = null;

  private reconnectionTimer: NodeJS.Timeout | null = null;
  private firstReconnectionTimestamp: number | null = null;
  private reconnectionAttempt = 0;
  private readonly maxReconnectionAttempts = 10;
  private readonly maxReconnectionDurationMs = 3 * 60 * 1000;
  private readonly baseReconnectionDelayMs = 2000;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: LiveTrackerSnapshot): LiveTrackerViewModel {
    const { connectionState, lastStateMessage, params, statusText: initialStatusText } = snapshot;

    let title: string;
    let subtitle: string;
    let iconUrl: string | null = null;

    if (params.type === "team") {
      title =
        lastStateMessage?.type === "state" && lastStateMessage.data.type === "neatqueue"
          ? lastStateMessage.data.guildName
          : params.server.length > 0
            ? `Guild ${params.server}`
            : "";
      subtitle = params.queue.length > 0 ? `Queue #${params.queue}` : "";
      iconUrl =
        lastStateMessage?.type === "state" && lastStateMessage.data.type === "neatqueue"
          ? lastStateMessage.data.guildIcon
          : null;
    } else {
      title = params.gamertag.length > 0 ? params.gamertag : "Not set";
      subtitle = "Individual";
      iconUrl = null;
    }

    let statusClassName = "";
    if (connectionState === "connected") {
      statusClassName = "connected";
    } else if (
      connectionState === "error" ||
      connectionState === "stopped" ||
      connectionState === "connecting" ||
      connectionState === "not_found"
    ) {
      statusClassName = "error";
    }

    let statusText: string;

    if (connectionState === "connected" && lastStateMessage?.type === "state") {
      statusText = lastStateMessage.data.status;
    } else {
      statusText = initialStatusText;
    }

    return {
      title,
      subtitle,
      statusText,
      statusClassName,
      iconUrl,
      state: lastStateMessage?.type === "state" ? toLiveTrackerStateRenderModel(lastStateMessage) : null,
    };
  }

  // Helper function to compare params
  public static areParamsEqual(prev: LiveTrackerParams, curr: LiveTrackerParams): boolean {
    if (prev.type !== curr.type) {
      return false;
    }

    if (prev.type === "team" && curr.type === "team") {
      return prev.server === curr.server && prev.queue === curr.queue;
    }

    if (prev.type === "individual" && curr.type === "individual") {
      return prev.gamertag === curr.gamertag;
    }

    return false;
  }

  // Helper function to deeply compare state messages, ignoring timestamps
  public static isStateMessageEqual(prev: LiveTrackerMessage | null, curr: LiveTrackerMessage | null): boolean {
    if (prev === curr) {
      return true;
    }

    if (prev === null || curr === null) {
      return false;
    }

    // Compare meaningful data, excluding timestamps that change every broadcast
    const prevData = prev.data;
    const currData = curr.data;

    // First check if types match
    if (prevData.type !== currData.type) {
      return false;
    }

    // Common fields
    if (prevData.status !== currData.status) {
      return false;
    }

    // Compare rawMatches keys (actual content changes would be caught by match arrays)
    const prevMatchIds = Object.keys(prevData.rawMatches).sort();
    const currMatchIds = Object.keys(currData.rawMatches).sort();
    if (prevMatchIds.length !== currMatchIds.length || !prevMatchIds.every((id, idx) => id === currMatchIds[idx])) {
      return false;
    }

    // Compare medalMetadata keys (structural check)
    const prevMedalIds = Object.keys(prevData.medalMetadata).sort();
    const currMedalIds = Object.keys(prevData.medalMetadata).sort();
    if (prevMedalIds.length !== currMedalIds.length || !prevMedalIds.every((id, idx) => id === currMedalIds[idx])) {
      return false;
    }

    // Compare playersAssociationData if present
    if ((prevData.playersAssociationData == null) !== (currData.playersAssociationData == null)) {
      return false;
    }

    if (prevData.playersAssociationData != null && currData.playersAssociationData != null) {
      const prevPlayerIds = Object.keys(prevData.playersAssociationData).sort();
      const currPlayerIds = Object.keys(currData.playersAssociationData).sort();
      if (
        prevPlayerIds.length !== currPlayerIds.length ||
        !prevPlayerIds.every((id, idx) => id === currPlayerIds[idx])
      ) {
        return false;
      }

      // Check if any player data changed
      for (const playerId of prevPlayerIds) {
        const prevPlayer = prevData.playersAssociationData[playerId];
        const currPlayer = currData.playersAssociationData[playerId];

        // Compare all player fields except lastRankedGamePlayed timestamp
        if (
          prevPlayer.discordId !== currPlayer.discordId ||
          prevPlayer.discordName !== currPlayer.discordName ||
          prevPlayer.xboxId !== currPlayer.xboxId ||
          prevPlayer.gamertag !== currPlayer.gamertag ||
          prevPlayer.currentRank !== currPlayer.currentRank ||
          prevPlayer.currentRankTier !== currPlayer.currentRankTier ||
          prevPlayer.currentRankSubTier !== currPlayer.currentRankSubTier ||
          prevPlayer.allTimePeakRank !== currPlayer.allTimePeakRank ||
          prevPlayer.esra !== currPlayer.esra ||
          prevPlayer.lastRankedGamePlayed !== currPlayer.lastRankedGamePlayed
        ) {
          return false;
        }
      }
    }

    // Type-specific comparisons
    if (prevData.type === "neatqueue" && currData.type === "neatqueue") {
      if (
        prevData.queueNumber !== currData.queueNumber ||
        prevData.guildId !== currData.guildId ||
        prevData.channelId !== currData.channelId ||
        prevData.guildName !== currData.guildName ||
        prevData.seriesScore !== currData.seriesScore ||
        prevData.players.length !== currData.players.length ||
        prevData.teams.length !== currData.teams.length ||
        prevData.substitutions.length !== currData.substitutions.length ||
        prevData.matchSummaries.length !== currData.matchSummaries.length
      ) {
        return false;
      }

      // Compare players by ID (order matters)
      for (let i = 0; i < prevData.players.length; i++) {
        if (
          prevData.players[i].id !== currData.players[i].id ||
          prevData.players[i].discordUsername !== currData.players[i].discordUsername
        ) {
          return false;
        }
      }

      // Compare teams structure
      for (let i = 0; i < prevData.teams.length; i++) {
        const prevTeam = prevData.teams[i];
        const currTeam = currData.teams[i];
        if (
          prevTeam.name !== currTeam.name ||
          prevTeam.playerIds.length !== currTeam.playerIds.length ||
          !prevTeam.playerIds.every((id: string, idx: number) => id === currTeam.playerIds[idx])
        ) {
          return false;
        }
      }

      // Compare substitutions (excluding timestamps if they're the same event)
      for (let i = 0; i < prevData.substitutions.length; i++) {
        const prevSub = prevData.substitutions[i];
        const currSub = currData.substitutions[i];
        if (
          prevSub.playerOutId !== currSub.playerOutId ||
          prevSub.playerInId !== currSub.playerInId ||
          prevSub.teamIndex !== currSub.teamIndex ||
          prevSub.timestamp !== currSub.timestamp
        ) {
          return false;
        }
      }

      // Compare match summaries by matchId and key properties
      for (let i = 0; i < prevData.matchSummaries.length; i++) {
        const prevMatch = prevData.matchSummaries[i];
        const currMatch = currData.matchSummaries[i];
        if (
          prevMatch.matchId !== currMatch.matchId ||
          prevMatch.gameTypeAndMap !== currMatch.gameTypeAndMap ||
          prevMatch.gameScore !== currMatch.gameScore ||
          prevMatch.duration !== currMatch.duration ||
          prevMatch.startTime !== currMatch.startTime ||
          prevMatch.endTime !== currMatch.endTime
        ) {
          return false;
        }
      }

      return true;
    }

    if (prevData.type === "individual" && currData.type === "individual") {
      if (
        prevData.gamertag !== currData.gamertag ||
        prevData.xuid !== currData.xuid ||
        prevData.groups.length !== currData.groups.length
      ) {
        return false;
      }

      // Compare groups structure
      for (let i = 0; i < prevData.groups.length; i++) {
        const prevGroup = prevData.groups[i];
        const currGroup = currData.groups[i];

        if (prevGroup.type !== currGroup.type || prevGroup.groupId !== currGroup.groupId) {
          return false;
        }

        // Type-specific group comparisons (types are equal at this point)
        switch (prevGroup.type) {
          case "neatqueue-series": {
            // Type assertion: we know currGroup.type === "neatqueue-series" from the equality check above
            const currentTyped = currGroup as typeof prevGroup;
            if (
              prevGroup.seriesScore !== currentTyped.seriesScore ||
              prevGroup.matchSummaries.length !== currentTyped.matchSummaries.length ||
              prevGroup.players.length !== currentTyped.players.length ||
              prevGroup.teams.length !== currentTyped.teams.length
            ) {
              return false;
            }
            break;
          }
          case "grouped-matches": {
            const currentTyped = currGroup as typeof prevGroup;
            if (
              prevGroup.label !== currentTyped.label ||
              prevGroup.seriesScore !== currentTyped.seriesScore ||
              prevGroup.matchSummaries.length !== currentTyped.matchSummaries.length
            ) {
              return false;
            }
            break;
          }
          case "single-match": {
            const currentTyped = currGroup as typeof prevGroup;
            if (prevGroup.matchSummary.matchId !== currentTyped.matchSummary.matchId) {
              return false;
            }
            break;
          }
          default: {
            throw new UnreachableError(prevGroup);
          }
        }
      }

      return true;
    }

    // All meaningful data is the same, only timestamps differ
    return true;
  }

  private static parseParamsFromUrl(url: URL): LiveTrackerParams {
    const gamertag = url.searchParams.get("gamertag");
    if (gamertag !== null && gamertag.length > 0) {
      return {
        type: "individual",
        gamertag,
      };
    }

    return {
      type: "team",
      server: url.searchParams.get("server") ?? "",
      queue: url.searchParams.get("queue") ?? "",
    };
  }

  private static canConnect(params: LiveTrackerParams): boolean {
    if (params.type === "team") {
      return params.server.length > 0 && params.queue.length > 0;
    }
    return params.gamertag.length > 0;
  }

  private static toIdentity(params: LiveTrackerParams): LiveTrackerIdentity {
    if (params.type === "team") {
      return {
        type: "team",
        guildId: params.server,
        queueNumber: params.queue,
      };
    }
    return {
      type: "individual",
      gamertag: params.gamertag,
    };
  }

  public start(): void {
    const params = LiveTrackerPresenter.parseParamsFromUrl(this.config.getUrl());

    if (!LiveTrackerPresenter.canConnect(params)) {
      this.config.store.setSnapshot({
        params,
        connectionState: "idle",
        statusText: LiveTrackerPresenter.usageText,
        lastStateMessage: null,
        hasConnection: false,
        hasReceivedInitialData: false,
      });
      return;
    }

    this.disconnect();

    const previous = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...previous,
      params,
      connectionState: "connecting",
      statusText: "Connecting...",
      hasConnection: false,
    });

    void this.connectInternal(LiveTrackerPresenter.toIdentity(params));
  }

  public dispose(): void {
    this.isDisposed = true;
    this.disconnect();
  }

  private disconnect(): void {
    this.stopReconnection();
    this.cleanupConnection();

    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      hasConnection: false,
      lastStateMessage: null,
      hasReceivedInitialData: false,
    });
  }

  private stopReconnection(): void {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
    this.firstReconnectionTimestamp = null;
    this.reconnectionAttempt = 0;
  }

  private cleanupConnection(): void {
    this.messageSubscription?.unsubscribe();
    this.statusSubscription?.unsubscribe();
    this.messageSubscription = null;
    this.statusSubscription = null;

    if (this.connection) {
      this.connection.disconnect();
      this.connection = null;
    }
  }

  private async connectInternal(identity: LiveTrackerIdentity): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    this.cleanupConnection();

    const nextConnection = await this.config.services.liveTrackerService.connect(identity);
    this.connection = nextConnection;

    const current = this.config.store.getSnapshot();
    this.config.store.setSnapshot({
      ...current,
      hasConnection: true,
    });

    this.statusSubscription = nextConnection.subscribeStatus(
      (status: LiveTrackerConnectionStatus, detail?: string): void => {
        if (this.isDisposed) {
          return;
        }

        const snapshot = this.config.store.getSnapshot();

        if (status === "connected") {
          this.stopReconnection();
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Connected",
          });
          return;
        }

        if (status === "connecting") {
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Connecting...",
          });
          return;
        }

        if (status === "stopped") {
          this.stopReconnection();
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: "Tracker Stopped",
          });
          return;
        }

        if (status === "not_found") {
          this.stopReconnection();
          const message =
            snapshot.params.type === "individual"
              ? `No active tracker found for gamertag "${snapshot.params.gamertag}". Start a tracker first.`
              : "No active tracker found for this queue. Start a tracker first.";
          this.config.store.setSnapshot({
            ...snapshot,
            connectionState: status,
            statusText: message,
          });
          return;
        }

        this.handleConnectionLost(identity, detail);
      },
    );

    this.messageSubscription = nextConnection.subscribe((message: LiveTrackerMessage): void => {
      if (this.isDisposed) {
        return;
      }

      const snapshot = this.config.store.getSnapshot();

      this.config.store.setSnapshot({
        ...snapshot,
        lastStateMessage: message,
        hasReceivedInitialData: true,
      });
    });
  }

  private handleConnectionLost(identity: LiveTrackerIdentity, detail?: string): void {
    const snapshot = this.config.store.getSnapshot();

    // If we've never received initial data, this is likely a "tracker not found" scenario
    // Don't retry in this case
    if (!snapshot.hasReceivedInitialData && this.reconnectionAttempt === 0) {
      const message =
        snapshot.params.type === "individual"
          ? `No active tracker found for gamertag "${snapshot.params.gamertag}". Start a tracker first.`
          : "No active tracker found for this queue. Start a tracker first.";
      this.config.store.setSnapshot({
        ...snapshot,
        connectionState: "not_found",
        statusText: message,
      });
      this.stopReconnection();
      return;
    }

    const now = Date.now();
    this.firstReconnectionTimestamp ??= now;

    const elapsed = now - this.firstReconnectionTimestamp;

    if (elapsed > this.maxReconnectionDurationMs || this.reconnectionAttempt >= this.maxReconnectionAttempts) {
      const hasDetail = (detail?.length ?? 0) > 0;
      const errorText = hasDetail ? `Connection error: ${detail ?? ""}` : "Connection lost";
      const reason =
        elapsed > this.maxReconnectionDurationMs
          ? "Gave up after 3m"
          : `Max retries reached (${String(this.maxReconnectionAttempts)})`;
      this.config.store.setSnapshot({
        ...snapshot,
        connectionState: "error",
        statusText: `${errorText} (${reason})`,
      });
      this.stopReconnection();
      return;
    }

    const backoffFactor = Math.pow(1.5, this.reconnectionAttempt);
    const delay = Math.min(this.baseReconnectionDelayMs * backoffFactor, 30000); // Cap at 30s
    const jitter = Math.random() * 1000;
    const totalDelay = delay + jitter;

    this.config.store.setSnapshot({
      ...snapshot,
      connectionState: "connecting",
      statusText: `Lost connection, reconnecting... (Attempt ${String(this.reconnectionAttempt + 1)}/${String(this.maxReconnectionAttempts)})`,
    });

    this.reconnectionTimer = setTimeout(() => {
      void this.connectInternal(identity);
      this.reconnectionAttempt++;
    }, totalDelay);
  }
}
