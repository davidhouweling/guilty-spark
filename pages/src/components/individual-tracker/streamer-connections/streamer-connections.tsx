import React from "react";
import { Alert } from "../../alert/alert";
import styles from "./streamer-connections.module.css";

export function StreamerConnectionsSectionView(): React.ReactElement {
  return (
    <div className={styles.placeholderPanel}>
      <h2 className={styles.sectionTitle}>Streamer Connections</h2>
      <p className={styles.sectionDescription}>
        Connect your Twitch account to automate your stream - auto-start your tracker when you go live and pause it when
        your stream ends.
      </p>
      <Alert variant="info">Twitch integration coming soon.</Alert>
    </div>
  );
}
