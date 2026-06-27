import React from "react";
import cn from "classnames";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import styles from "./follow-tracker-tabs.module.css";

export interface FollowTrackerTabsProps {
  readonly directory: TrackerDirectory;
  readonly selectedTrackerId: string | null;
  readonly isFollowingLive: boolean;
  readonly onSelectTracker: (trackerId: string) => void;
  readonly onFollowLive: () => void;
}

function hasLiveTracker(directory: TrackerDirectory): boolean {
  for (const entry of directory.trackers) {
    if (entry.isLive) {
      return true;
    }
  }
  return false;
}

function isTrackerLive(entry: TrackerDirectory["trackers"][number]): boolean {
  return entry.isLive;
}

function toWinLossRecord(matches: readonly { readonly outcome: string }[]): string {
  let wins = 0;
  let losses = 0;
  for (const match of matches) {
    if (match.outcome === "Win") {
      wins += 1;
      continue;
    }

    if (match.outcome === "Loss") {
      losses += 1;
    }
  }

  return `${wins.toString()}:${losses.toString()}`;
}

export function FollowTrackerTabs({
  directory,
  selectedTrackerId,
  isFollowingLive,
  onSelectTracker,
  onFollowLive,
}: FollowTrackerTabsProps): React.ReactElement {
  const showFollowLive = !isFollowingLive && hasLiveTracker(directory);

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs} role="tablist">
        {directory.trackers.map((entry) => (
          <button
            key={entry.trackerId}
            type="button"
            role="tab"
            aria-selected={entry.trackerId === selectedTrackerId}
            className={cn(styles.tab, { [styles.selected]: entry.trackerId === selectedTrackerId })}
            onClick={(): void => {
              onSelectTracker(entry.trackerId);
            }}
          >
            <span className={styles.tabGamertag}>{entry.gamertag}</span>
            <span className={styles.tabRecord} data-testid="tab-record">
              {toWinLossRecord(entry.matches)}
            </span>
            {isTrackerLive(entry) && (
              <span className={styles.liveBadge} data-testid="live-badge">
                Live
              </span>
            )}
          </button>
        ))}
      </div>
      {showFollowLive && (
        <button type="button" className={styles.followLiveButton} onClick={onFollowLive} data-testid="follow-live-btn">
          Follow live
        </button>
      )}
    </div>
  );
}
