import type { ReactElement, ReactNode } from "react";
import { Button } from "../button/button";
import type { IndividualTrackerAuthState, IndividualTrackerSectionId } from "./individual-tracker-store";
import styles from "./individual-tracker.module.css";

interface IndividualTrackerShellProps {
  readonly authState: IndividualTrackerAuthState;
  readonly errorMessage: string | null;
  readonly activeSection: IndividualTrackerSectionId;
  readonly onSignIn: () => void;
  readonly onSectionChange: (id: IndividualTrackerSectionId) => void;
  readonly liveTrackersContent: ReactNode;
  readonly streamerSettingsContent: ReactNode;
}

export function IndividualTrackerShell({
  authState,
  errorMessage,
  activeSection,
  onSignIn,
  onSectionChange,
  liveTrackersContent,
  streamerSettingsContent,
}: IndividualTrackerShellProps): ReactElement {
  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Individual Tracker</h1>

      {authState === "loading" && <p className={styles.loading}>Checking session...</p>}

      {authState === "unauthenticated" && (
        <div className={styles.authWall}>
          <p className={styles.authWallText}>Sign in to manage your trackers.</p>
          {errorMessage != null && <p className={styles.errorMessage}>{errorMessage}</p>}
          <Button onClick={onSignIn}>Sign in with Microsoft</Button>
        </div>
      )}

      {authState === "authenticated" && (
        <>
          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tabButton} ${activeSection === "live-trackers" ? styles.tabButtonActive : ""}`}
              onClick={(): void => {
                onSectionChange("live-trackers");
              }}
            >
              Live Trackers
            </button>
            <button
              type="button"
              className={`${styles.tabButton} ${activeSection === "streamer-settings" ? styles.tabButtonActive : ""}`}
              onClick={(): void => {
                onSectionChange("streamer-settings");
              }}
            >
              Streamer Settings
            </button>
          </div>

          {activeSection === "live-trackers" && liveTrackersContent}
          {activeSection === "streamer-settings" && streamerSettingsContent}
        </>
      )}
    </div>
  );
}
