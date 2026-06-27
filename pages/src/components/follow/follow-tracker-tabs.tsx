import React from "react";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { TrackerMatchSummary } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { TabbedSection } from "../tabbed-section/tabbed-section";
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

function toWinLossRecord(matches: readonly TrackerMatchSummary[]): string {
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

function getSelectedTabId(directory: TrackerDirectory, selectedTrackerId: string | null): string | null {
  if (selectedTrackerId != null) {
    for (const tracker of directory.trackers) {
      if (tracker.trackerId === selectedTrackerId) {
        return selectedTrackerId;
      }
    }
  }

  const [firstTracker] = directory.trackers;
  return firstTracker.trackerId;
}

export function FollowTrackerTabs({
  directory,
  selectedTrackerId,
  isFollowingLive,
  onSelectTracker,
  onFollowLive,
}: FollowTrackerTabsProps): React.ReactElement {
  const showFollowLive = !isFollowingLive && hasLiveTracker(directory);
  const selectedTabId = getSelectedTabId(directory, selectedTrackerId);
  const tabs = directory.trackers.map((entry) => ({
    id: entry.trackerId,
    label: (
      <span className={styles.tabLabel}>
        <span className={styles.tabGamertag}>{entry.gamertag}</span>
        <span className={styles.tabRecord} data-testid="tab-record">
          {toWinLossRecord(entry.matches)}
        </span>
        {entry.isLive && (
          <span className={styles.liveBadge} data-testid="live-badge">
            Live
          </span>
        )}
      </span>
    ),
    content: null,
  }));

  return (
    <div className={styles.tabBar}>
      {selectedTabId != null && (
        <TabbedSection
          tabs={tabs}
          selectedTabId={selectedTabId}
          tabListAriaLabel="Followed trackers"
          onTabChange={onSelectTracker}
          tabsClassName={styles.tabs}
          tabContainerClassName={styles.tabPanel}
        />
      )}
      {showFollowLive && (
        <button type="button" className={styles.followLiveButton} onClick={onFollowLive} data-testid="follow-live-btn">
          Follow live
        </button>
      )}
    </div>
  );
}
