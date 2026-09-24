import type { ReactElement, ReactNode } from "react";
import { Button } from "../button/button";
import { Heading } from "../heading/heading";
import { LoadingState } from "../loading-state/loading-state";
import type { IndividualTrackerAuthState } from "./individual-tracker-store";
import styles from "./individual-tracker.module.css";

interface IndividualTrackerShellProps {
  readonly authState: IndividualTrackerAuthState;
  readonly errorMessage: string | null;
  readonly onSignIn: () => void;
  readonly liveTrackersContent: ReactNode;
}

export function IndividualTrackerShell({
  authState,
  errorMessage,
  onSignIn,
  liveTrackersContent,
}: IndividualTrackerShellProps): ReactElement {
  return (
    <div className={styles.container}>
      <Heading tagName="h1" spacing={6}>
        Individual Tracker
      </Heading>

      {authState === "loading" && <LoadingState text="Checking session..." />}

      {authState === "unauthenticated" && (
        <div className={styles.authWall}>
          <p className={styles.authWallText}>Sign in to manage your trackers.</p>
          {errorMessage != null && <p className={styles.errorMessage}>{errorMessage}</p>}
          <Button onClick={onSignIn}>Sign in with Microsoft</Button>
        </div>
      )}

      {authState === "authenticated" && <div className={styles.liveTrackers}>{liveTrackersContent}</div>}
    </div>
  );
}
