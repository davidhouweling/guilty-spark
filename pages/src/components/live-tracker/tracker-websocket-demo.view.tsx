import React from "react";
import styles from "./tracker-websocket-demo.module.css";
import type { TrackerWebSocketDemoViewModel } from "./types";

interface TrackerWebsocketDemoProps {
  readonly model: TrackerWebSocketDemoViewModel;
  readonly onDisconnect: () => void;
}

export function TrackerWebSocketDemoView({ model, onDisconnect }: TrackerWebsocketDemoProps): React.ReactElement {
  return (
    <>
      <div id="connection-info" className={styles.connectionInfo}>
        <div className={styles.infoGroup}>
          <label className={styles.infoLabel}>Guild ID:</label>
          <span className={styles.infoValue}>{model.guildIdText}</span>
        </div>

        <div className={styles.infoGroup}>
          <label className={styles.infoLabel}>Channel ID:</label>
          <span className={styles.infoValue}>{model.channelIdText}</span>
        </div>

        <div className={styles.infoGroup}>
          <label className={styles.infoLabel}>Queue Number:</label>
          <span className={styles.infoValue}>{model.queueNumberText}</span>
        </div>

        <button
          type="button"
          className={styles.disconnectButton}
          onClick={onDisconnect}
          disabled={model.disconnectDisabled}
        >
          Disconnect
        </button>
      </div>

      <div id="connection-status" className={styles.status}>
        <strong>Status:</strong>{" "}
        <span id="status-text" className={model.statusClassName}>
          {model.statusText}
        </span>
      </div>

      <div id="data-container" className={styles.dataContainer}>
        <h2>Live Tracker Data:</h2>
        <pre id="tracker-data">{model.rawMessageText}</pre>
      </div>
    </>
  );
}
