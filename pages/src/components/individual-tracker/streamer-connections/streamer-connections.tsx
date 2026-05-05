import React from "react";
import { Alert } from "../../alert/alert";
import styles from "./streamer-connections.module.css";

export function StreamerConnectionsSectionView(): React.ReactElement {
  return (
    <div className={styles.placeholderPanel}>
      <h2 className={styles.sectionTitle}>Streamer Settings</h2>
      <p className={styles.sectionDescription}>
        Configure the active viewer and OBS overlay for your stream. Stable XUID-based view and overlay routes will land
        here alongside the longer-term Twitch automation work.
      </p>
      <Alert variant="info">Overlay and Twitch settings are the next implementation slice.</Alert>
    </div>
  );
}
