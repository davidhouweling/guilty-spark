import React from "react";
import styles from "./loading-state.module.css";

interface LoadingStateProps {
  text?: string;
}

export function LoadingState({ text }: LoadingStateProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <div className={styles.spinnerContainer}>
        <div className={styles.spinner}></div>
        <div className={styles.spinnerGlow}></div>
      </div>
      <p className={styles.loadingText}>{text ?? "Establishing Connection..."}</p>
    </div>
  );
}
