import React from "react";
import { Heading } from "../heading/heading";
import { Select } from "../select/select";
import { SortableTable } from "../table/sortable-table";
import type { SortableTableColumn } from "../table/sortable-table";
import type { LeaderboardTableRow, LeaderboardViewModel } from "./types";
import styles from "./leaderboard.module.css";

function ErrorContent({ message }: { readonly message: string }): React.ReactElement {
  return (
    <div className={styles.error}>
      <Heading tagName="h2" variant="display">
        Leaderboard unavailable
      </Heading>
      <p>{message}</p>
    </div>
  );
}

export function Leaderboard({
  state,
  errorMessage,
  title,
  scopeLabel,
  windowLabel,
  metricLabel,
  rows,
  queueOptions,
  windowOptions,
  metricGroups,
  selectedQueueChannelId,
  selectedWindow,
  selectedMetric,
  onQueueChange,
  onWindowChange,
  onMetricChange,
}: LeaderboardViewModel): React.ReactElement {
  const columns: readonly SortableTableColumn<LeaderboardTableRow>[] = [
    {
      id: "rank",
      header: "Rank",
      accessorFn: (row): number => row.rank,
      cell: (value): React.ReactNode => `#${String(value)}`,
      enableSorting: false,
    },
    {
      id: "gamertag",
      header: "Player",
      accessorFn: (row): string => row.gamertag,
    },
    {
      id: "value",
      header: metricLabel,
      accessorFn: (row): string => row.value,
      cell: (value): React.ReactNode => String(value),
    },
    {
      id: "gamesPlayed",
      header: "Games",
      accessorFn: (row): number => row.gamesPlayed,
      cell: (value): React.ReactNode => Number(value).toLocaleString(),
    },
  ];

  if (state === "error") {
    return (
      <div className={styles.page}>
        <ErrorContent message={errorMessage ?? "Unable to load leaderboard."} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <Heading tagName="h1" variant="display">
            {title}
          </Heading>
          <p className={styles.scope}>
            {scopeLabel} <span aria-hidden="true">/</span> {windowLabel}
          </p>
        </div>
        <div className={styles.status} data-loading={state === "loading"}>
          {state === "loading" ? "UPDATING" : `${rows.length.toString()} PLAYERS`}
        </div>
      </div>
      <div className={styles.controls} aria-label="Leaderboard filters">
        <label>
          <span>Queue</span>
          <Select
            value={selectedQueueChannelId ?? "all"}
            onChange={(event): void => {
              onQueueChange(event.target.value);
            }}
          >
            {queueOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <label>
          <span>Stat</span>
          <Select
            value={selectedMetric}
            onChange={(event): void => {
              onMetricChange(event.target.value);
            }}
          >
            {metricGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </label>
        <label>
          <span>Window</span>
          <Select
            value={selectedWindow}
            onChange={(event): void => {
              onWindowChange(event.target.value);
            }}
          >
            {windowOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <section className={styles.tableSection}>
        <SortableTable
          data={rows}
          columns={columns}
          getRowKey={(row): string => row.xboxXuid}
          ariaLabel="Leaderboard rankings"
          initialSort={{ columnId: "rank" }}
        />
      </section>
    </div>
  );
}
