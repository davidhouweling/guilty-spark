import React, { useEffect, useMemo, useState } from "react";
import type { LiveTrackerIdentity, LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
import { installServices } from "../../services/install";
import type {
  LiveTrackerConnection,
  LiveTrackerConnectionStatus,
  LiveTrackerSubscription,
} from "../../services/live-tracker/types";
import type { Services } from "../../services/install";
import styles from "./tracker-websocket-demo.module.css";

type ConnectionState = "idle" | LiveTrackerConnectionStatus;

interface Props {
  readonly apiHost: string;
  readonly servicesOverride?: Services;
}

export function TrackerWebSocketDemo(props: Props): React.ReactElement {
  const { apiHost, servicesOverride } = props;

  const params = useMemo((): { readonly guildId: string; readonly channelId: string; readonly queueNumber: string } => {
    const url = new URL(window.location.href);
    return {
      guildId: url.searchParams.get("guildId") ?? "",
      channelId: url.searchParams.get("channelId") ?? "",
      queueNumber: url.searchParams.get("queueNumber") ?? "",
    };
  }, []);

  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [statusText, setStatusText] = useState<string>("Waiting for query parameters");
  const [rawMessageText, setRawMessageText] = useState<string>(
    "Usage: /tracker?guildId=123&channelId=456&queueNumber=1",
  );

  const [connection, setConnection] = useState<LiveTrackerConnection | null>(null);

  const canConnect = params.guildId.length > 0 && params.channelId.length > 0 && params.queueNumber.length > 0;

  const disconnect = (): void => {
    if (connection) {
      connection.disconnect();
      setConnection(null);
    }

    setConnectionState("disconnected");
    setStatusText("Disconnected");
    setRawMessageText("Disconnected. Provide query parameters and reload to reconnect.");
  };

  useEffect(() => {
    if (!canConnect) {
      setConnectionState("idle");
      setStatusText("Waiting for query parameters");
      setRawMessageText("Usage: /tracker?guildId=123&channelId=456&queueNumber=1");
      return;
    }

    let isCancelled = false;

    const identity: LiveTrackerIdentity = {
      guildId: params.guildId,
      channelId: params.channelId,
      queueNumber: params.queueNumber,
    };

    let messageSubscription: LiveTrackerSubscription | null = null;
    let statusSubscription: LiveTrackerSubscription | null = null;
    let nextConnection: LiveTrackerConnection | null = null;

    setConnectionState("connecting");
    setStatusText("Connecting...");

    void (async (): Promise<void> => {
      const services = servicesOverride ?? (await installServices(apiHost));
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (isCancelled) {
        return;
      }

      nextConnection = services.liveTrackerService.connect(identity);
      setConnection(nextConnection);

      statusSubscription = nextConnection.subscribeStatus(
        (status: LiveTrackerConnectionStatus, detail?: string): void => {
          setConnectionState(status);
          if (status === "connected") {
            setStatusText("Connected");
            setRawMessageText((current): string =>
              current.includes("Usage:") ? "Connected! Waiting for data..." : current,
            );
          } else if (status === "connecting") {
            setStatusText("Connecting...");
          } else if (status === "stopped") {
            setStatusText("Tracker Stopped");
          } else if (status === "disconnected") {
            setStatusText("Disconnected (Normal)");
          } else {
            setStatusText("Connection error");
            if (detail !== undefined && detail.length > 0) {
              setRawMessageText((current): string => `${current}\n\nConnection closed: ${detail}`);
            }
          }
        },
      );

      messageSubscription = nextConnection.subscribe((message: LiveTrackerMessage): void => {
        if (message.type === "stopped") {
          setRawMessageText((current) =>
            current.includes("🛑") ? current : `${current}\n\n🛑 Tracker has been stopped.`,
          );
          return;
        }

        setRawMessageText(JSON.stringify(message, null, 2));
      });
    })();

    return (): void => {
      isCancelled = true;
      messageSubscription?.unsubscribe();
      statusSubscription?.unsubscribe();
      nextConnection?.disconnect();
    };
  }, [apiHost, canConnect, params.channelId, params.guildId, params.queueNumber]);

  let statusClassName = "";
  if (connectionState === "connected") {
    statusClassName = "connected";
  } else if (connectionState === "error" || connectionState === "stopped") {
    statusClassName = "error";
  }

  return (
    <>
      <div id="connection-info" className={styles.connectionInfo}>
        <div className={styles.infoGroup}>
          <label className={styles.infoLabel}>Guild ID:</label>
          <span className={styles.infoValue}>{params.guildId || "Not set"}</span>
        </div>

        <div className={styles.infoGroup}>
          <label className={styles.infoLabel}>Channel ID:</label>
          <span className={styles.infoValue}>{params.channelId || "Not set"}</span>
        </div>

        <div className={styles.infoGroup}>
          <label className={styles.infoLabel}>Queue Number:</label>
          <span className={styles.infoValue}>{params.queueNumber || "Not set"}</span>
        </div>

        <button type="button" className={styles.disconnectButton} onClick={disconnect} disabled={connection === null}>
          Disconnect
        </button>
      </div>

      <div id="connection-status" className={styles.status}>
        <strong>Status:</strong>{" "}
        <span id="status-text" className={statusClassName}>
          {statusText}
        </span>
      </div>

      <div id="data-container" className={styles.dataContainer}>
        <h2>Live Tracker Data:</h2>
        <pre id="tracker-data">{rawMessageText}</pre>
      </div>
    </>
  );
}
