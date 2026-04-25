import React from "react";
import { Alert } from "../../alert/alert";
import styles from "./additional-options.module.css";

export function AdditionalOptionsSectionView(): React.ReactElement {
  return (
    <div className={styles.placeholderPanel}>
      <h2 className={styles.sectionTitle}>Additional Options</h2>
      <p className={styles.sectionDescription}>
        Fine-tune tracker behaviour - control what happens when you log out and manage visibility of stopped trackers.
      </p>
      <Alert variant="info">Additional settings coming soon.</Alert>
    </div>
  );
}
