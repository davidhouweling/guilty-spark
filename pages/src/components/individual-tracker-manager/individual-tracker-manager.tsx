import React from "react";
import classNames from "classnames";
import { Button } from "../button/button";
import { Dialog } from "../dialog/dialog";
import { Input } from "../input/input";
import type { TrackerRowAction, TrackerRowModel } from "./manager-model";
import { MAX_TRACKERS } from "./manager-model";
import { useManagerActions, useManagerModel, useManagerSettingsService } from "./individual-tracker-manager-context";
import { StreamerConnectionsSection } from "./streamer-connections/create";
import styles from "./individual-tracker-manager.module.css";

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

export function IndividualTrackerManagerView(): React.ReactElement {
  const {
    model,
    profileName,
    isAddDialogOpen,
    gamertagInput,
    searchStartTime,
    idleTimeoutHours,
    addPending,
    pendingTrackerId,
    addDisabled,
    settings,
    liveXuid,
  } = useManagerModel();
  const {
    onOpenAddDialog,
    onCloseAddDialog,
    onGamertagInputChange,
    onSearchStartTimeChange,
    onIdleTimeoutHoursChange,
    onAddTracker,
    onRowAction,
  } = useManagerActions();
  const settingsService = useManagerSettingsService();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.heading}>Trackers</h1>
        <p className={styles.subtext}>{profileName}</p>
      </div>

      <div className={styles.addBar}>
        <Button type="button" disabled={!model.canAddTracker} onClick={onOpenAddDialog}>
          Add tracker
        </Button>
      </div>

      <Dialog open={isAddDialogOpen} title="Add tracker" onClose={onCloseAddDialog}>
        <form
          className={styles.addForm}
          onSubmit={(event) => {
            event.preventDefault();
            onAddTracker();
          }}
        >
          <Input
            label="Gamertag"
            value={gamertagInput}
            placeholder="Enter a gamertag"
            disabled={addPending}
            onChange={(event) => {
              onGamertagInputChange(event.target.value);
            }}
          />
          <Input
            label="Search start time"
            type="datetime-local"
            hint="Optional. Only track matches from this time onward."
            value={searchStartTime}
            disabled={addPending}
            onChange={(event) => {
              onSearchStartTimeChange(event.target.value);
            }}
          />
          <Input
            label="Idle timeout (hours)"
            type="number"
            min={0}
            step="any"
            hint="Optional. Pause the tracker after this many idle hours."
            value={idleTimeoutHours}
            disabled={addPending}
            onChange={(event) => {
              onIdleTimeoutHoursChange(event.target.value);
            }}
          />
          <div className={styles.dialogActions}>
            <Button type="button" variant="secondary" onClick={onCloseAddDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={addDisabled}>
              Track
            </Button>
          </div>
        </form>
      </Dialog>

      <section className={styles.settingsSection}>
        <StreamerConnectionsSection settings={settings} settingsService={settingsService} xuid={liveXuid} />
      </section>

      {model.isAtLimit && (
        <p className={styles.limitNotice}>
          You have reached the limit of {MAX_TRACKERS} trackers. Stop one to add another.
        </p>
      )}

      {model.isEmpty ? (
        <div className={styles.empty}>No trackers yet. Use Add tracker to start tracking a gamertag.</div>
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
