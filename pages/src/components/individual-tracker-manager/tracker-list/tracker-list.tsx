import React from "react";
import classNames from "classnames";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Alert } from "../../alert/alert";
import { Dropdown } from "../../dropdown/dropdown";
import styles from "./tracker-list.module.css";

export type TrackerDisplayStatus = "active" | "paused" | "stopped" | "not-started";

export interface TrackerListItem {
  readonly trackerId: string | null;
  readonly gamertag: string;
  readonly status: TrackerDisplayStatus;
  readonly isLive: boolean;
  readonly isPinned: boolean;
  readonly hasActiveSeries: boolean;
}

export interface TrackerRowAction {
  readonly label: string;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}

interface TrackerRowProps {
  readonly item: TrackerListItem;
  readonly actions: readonly TrackerRowAction[];
}

interface TrackerListProps {
  readonly items: readonly TrackerListItem[];
  readonly onAddTracker?: () => void;
  readonly getActions: (item: TrackerListItem) => readonly TrackerRowAction[];
}

function statusLabel(status: TrackerDisplayStatus): string {
  switch (status) {
    case "active": {
      return "Active";
    }
    case "paused": {
      return "Paused";
    }
    case "stopped": {
      return "Stopped";
    }
    case "not-started": {
      return "Not started";
    }
    default: {
      throw new UnreachableError(status);
    }
  }
}

function StatusBadge({ status }: { status: TrackerDisplayStatus }): React.ReactElement {
  return (
    <span
      className={classNames(styles.statusBadge, {
        [styles.statusActive]: status === "active",
        [styles.statusPaused]: status === "paused",
        [styles.statusStopped]: status === "stopped" || status === "not-started",
      })}
    >
      {statusLabel(status)}
    </span>
  );
}

function LiveBadge(): React.ReactElement {
  return <span className={styles.liveBadge}>Live</span>;
}

const EllipsisIcon = (): React.ReactElement => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="3" cy="8" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="13" cy="8" r="1.5" />
  </svg>
);

function TrackerRow({ item, actions }: TrackerRowProps): React.ReactElement {
  return (
    <div className={styles.row} data-testid="tracker-row">
      <div className={styles.rowMain}>
        <span className={styles.rowGamertag}>
          {item.gamertag}
          {item.isPinned && <span className={styles.pinnedLabel}>(your account)</span>}
        </span>

        <div className={styles.rowBadges}>
          <StatusBadge status={item.status} />
          {item.isLive && <LiveBadge />}
        </div>
      </div>

      <div className={styles.rowActions}>
        <Dropdown
          trigger={<EllipsisIcon />}
          ariaLabel={`Options for ${item.gamertag}`}
          dropdownWidth={200}
          dropdownHeight={220}
        >
          <div className={styles.menuList}>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={action.disabled === true}
                className={classNames(styles.menuItem, {
                  [styles.menuItemDestructive]: action.destructive === true,
                  [styles.menuItemDisabled]: action.disabled === true,
                })}
                onClick={action.onClick}
              >
                {action.label}
              </button>
            ))}
          </div>
        </Dropdown>
      </div>
    </div>
  );
}

function EmptyInfoPanel(): React.ReactElement {
  return (
    <div className={styles.emptyInfo}>
      <h3 className={styles.emptyInfoTitle}>How individual tracking works</h3>
      <p className={styles.emptyInfoText}>
        Your live tracker monitors your Halo Infinite match history in real time. Once started, it polls for new matches
        and displays them on your streamer overlay — without requiring your browser to stay open.
      </p>
      <ul className={styles.emptyInfoList}>
        <li>Start a tracker for your linked gamertag or any other player.</li>
        <li>Optionally pre-load recent matches to include in the overlay.</li>
        <li>Use the streamer overlay URL with your broadcasting software.</li>
        <li>Control the tracker from this page — pause, resume, or stop at any time.</li>
      </ul>
    </div>
  );
}

export function TrackerList({ items, onAddTracker, getActions }: TrackerListProps): React.ReactElement {
  const hasItems = items.length > 0;

  return (
    <div className={styles.listContainer}>
      <div className={styles.listHeader}>
        <h2 className={styles.listTitle}>Live Trackers</h2>
        <button type="button" className={styles.addButton} onClick={onAddTracker} aria-label="Add tracker">
          + Add tracker
        </button>
      </div>

      {!hasItems ? (
        <>
          <div className={styles.emptyList}>
            <Alert variant="info">No trackers yet. Start with your linked gamertag above.</Alert>
          </div>
          <EmptyInfoPanel />
        </>
      ) : (
        <div className={styles.list}>
          {items.map((item) => (
            <TrackerRow key={item.trackerId ?? `pinned-${item.gamertag}`} item={item} actions={getActions(item)} />
          ))}
        </div>
      )}
    </div>
  );
}
