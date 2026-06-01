import React from "react";
import classNames from "classnames";
import { Button } from "../button/button";
import { Input } from "../input/input";
import type { ManagerModel, TrackerRowAction, TrackerRowModel } from "./manager-model";
import { MAX_TRACKERS, isValidGamertagInput } from "./manager-model";
import styles from "./individual-tracker-manager.module.css";

interface IndividualTrackerManagerProps {
  readonly model: ManagerModel;
  readonly profileName: string;
  readonly gamertagInput: string;
  readonly addPending: boolean;
  readonly pendingTrackerId: string | null;
  readonly onGamertagInputChange: (value: string) => void;
  readonly onAddTracker: () => void;
  readonly onRowAction: (trackerId: string, action: TrackerRowAction) => void;
}

function StatusBadge({ row }: { readonly row: TrackerRowModel }): React.ReactElement {
  return (
    <span
      className={classNames(styles.statusBadge, {
        [styles.statusActive]: row.status === "active",
        [styles.statusPaused]: row.status === "paused",
        [styles.statusStopped]: row.status === "stopped",
      })}
    >
      {row.statusLabel}
    </span>
  );
}

interface TrackerRowProps {
  readonly row: TrackerRowModel;
  readonly pending: boolean;
  readonly onRowAction: (trackerId: string, action: TrackerRowAction) => void;
}

function TrackerRow({ row, pending, onRowAction }: TrackerRowProps): React.ReactElement {
  return (
    <div className={styles.row} data-testid="tracker-row">
      <div className={styles.rowMain}>
        <span className={styles.rowGamertag}>{row.gamertag}</span>
        <div className={styles.rowBadges}>
          <StatusBadge row={row} />
          {row.isLive && <span className={styles.liveBadge}>Live</span>}
        </div>
      </div>

      <div className={styles.rowActions}>
        {row.canSetLive && (
          <button
            type="button"
            className={styles.actionButton}
            disabled={pending}
            onClick={() => {
              onRowAction(row.trackerId, "setLive");
            }}
          >
            Set live
          </button>
        )}
        {row.canPause && (
          <button
            type="button"
            className={styles.actionButton}
            disabled={pending}
            onClick={() => {
              onRowAction(row.trackerId, "pause");
            }}
          >
            Pause
          </button>
        )}
        {row.canResume && (
          <button
            type="button"
            className={styles.actionButton}
            disabled={pending}
            onClick={() => {
              onRowAction(row.trackerId, "resume");
            }}
          >
            Resume
          </button>
        )}
        {row.canStop && (
          <button
            type="button"
            className={classNames(styles.actionButton, styles.actionDestructive)}
            disabled={pending}
            onClick={() => {
              onRowAction(row.trackerId, "stop");
            }}
          >
            Stop
          </button>
        )}
      </div>
    </div>
  );
}

export function IndividualTrackerManager({
  model,
  profileName,
  gamertagInput,
  addPending,
  pendingTrackerId,
  onGamertagInputChange,
  onAddTracker,
  onRowAction,
}: IndividualTrackerManagerProps): React.ReactElement {
  const addDisabled = !model.canAddTracker || addPending || !isValidGamertagInput(gamertagInput);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Trackers</h1>
        <p className={styles.subtext}>{profileName}</p>
      </div>

      <form
        className={styles.addForm}
        onSubmit={(event) => {
          event.preventDefault();
          onAddTracker();
        }}
      >
        <Input
          label="Gamertag"
          containerClassName={styles.addInput}
          value={gamertagInput}
          placeholder="Enter a gamertag"
          disabled={!model.canAddTracker || addPending}
          onChange={(event) => {
            onGamertagInputChange(event.target.value);
          }}
        />
        <Button type="submit" disabled={addDisabled}>
          Track
        </Button>
      </form>

      {model.isAtLimit && (
        <p className={styles.limitNotice}>
          You have reached the limit of {MAX_TRACKERS} trackers. Stop one to add another.
        </p>
      )}

      {model.isEmpty ? (
        <div className={styles.empty}>No trackers yet. Add a gamertag above to start tracking.</div>
      ) : (
        <div className={styles.list}>
          {model.rows.map((row) => (
            <TrackerRow
              key={row.trackerId}
              row={row}
              pending={pendingTrackerId === row.trackerId}
              onRowAction={onRowAction}
            />
          ))}
        </div>
      )}
    </div>
  );
}
