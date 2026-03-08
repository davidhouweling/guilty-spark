import React from "react";
import styles from "./error-state.module.css";

interface ErrorStateProps {
  readonly message?: string;
  readonly onRetry?: () => void;
  readonly onNavigateToSearch?: () => void;
}

export function ErrorState({ message, onRetry, onNavigateToSearch }: ErrorStateProps): React.ReactElement {
  return (
    <div className={styles.container}>
      <div className={styles.iconContainer}>
        <svg className={styles.errorIcon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
        <div className={styles.iconGlow}></div>
      </div>
      <div className={styles.content}>
        <h3 className={styles.errorTitle}>Connection Failed</h3>
        <p className={styles.errorMessage}>{message ?? "Unable to establish connection to the server."}</p>
        <div className={styles.buttonGroup}>
          {onRetry && (
            <button className={styles.retryButton} onClick={onRetry} type="button">
              Retry Connection
            </button>
          )}
          {onNavigateToSearch && (
            <button className={styles.searchButton} onClick={onNavigateToSearch} type="button">
              Tracker home
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
