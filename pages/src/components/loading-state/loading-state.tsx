import React from "react";
import styles from "./loading-state.module.css";

export function LoadingState(): React.ReactElement {
  return (
    <div className={styles.container}>
      <div className={styles.spinnerContainer}>
        <div className={styles.spinner}></div>
        <div className={styles.spinnerGlow}></div>
      </div>
      <p className={styles.loadingText}>Establishing Connection...</p>
    </div>
  );
}
