import React, { useMemo } from "react";
import { Heading } from "../heading/heading";
import { LoadingState } from "../loading-state/loading-state";
import { Select } from "../select/select";
import { TabbedSection } from "../tabbed-section/tabbed-section";
import type { TabbedSectionTab } from "../tabbed-section/types";
import { SortableTable } from "../table/sortable-table";
import type { SortableTableColumn } from "../table/sortable-table";
import type { PlayerLeaderboardStatRow, PlayerRelationshipRow, PlayerStatsTabId, PlayerStatsViewModel } from "./types";
import styles from "./player-stats.module.css";

function ErrorContent({ message }: { readonly message: string }): React.ReactElement {
  return (
    <div className={styles.error}>
      <Heading tagName="h2" variant="display">
        Player stats unavailable
      </Heading>
      <p>{message}</p>
    </div>
  );
}

function EmptyContent({ message }: { readonly message?: string | undefined }): React.ReactElement {
  return (
    <div className={styles.empty}>
      <Heading tagName="h2" variant="display">
        No stats found
      </Heading>
      <p>{message ?? "No stats match this server, queue, and time window."}</p>
    </div>
  );
}

export function PlayerStats({
  state,
  gamertag,
  scopeLabel,
  servers,
  queueOptions,
  windowOptions,
  relationshipMetricOptions,
  selectedGuildId,
  selectedQueueChannelId,
  selectedWindow,
  selectedTabId,
  selectedRelationshipMetric,
  statsRows,
  relationshipRows,
  errorMessage,
  statsFooter,
  relationshipFooter,
  onGuildChange,
  onQueueChange,
  onWindowChange,
  onTabChange,
  onRelationshipMetricChange,
}: PlayerStatsViewModel): React.ReactElement {
  const statColumns = useMemo<readonly SortableTableColumn<PlayerLeaderboardStatRow>[]>(
    () => [
      {
        id: "stat",
        header: "Stat",
        accessorFn: (row): string => row.stat,
        sortDescFirst: false,
      },
      {
        id: "rank",
        header: "Rank",
        accessorFn: (row): number | undefined => row.sortRank,
        cell: (_value, row): React.ReactNode => row.rank,
        sortDescFirst: false,
        sortUndefined: "last",
      },
      {
        id: "value",
        header: "Value",
        accessorFn: (row): number => row.sortValue,
        cell: (_value, row): React.ReactNode => row.value,
        sortDescFirst: true,
      },
    ],
    [],
  );

  const relationshipColumns = useMemo<readonly SortableTableColumn<PlayerRelationshipRow>[]>(
    () => [
      {
        id: "rank",
        header: "Rank",
        accessorFn: (row): number => row.sortRank,
        cell: (_value, row): React.ReactNode => row.rank,
        sortDescFirst: false,
      },
      {
        id: "player",
        header: "Player",
        accessorFn: (row): string => row.player,
        sortDescFirst: false,
      },
      {
        id: "value",
        header: "Value",
        accessorFn: (row): number => row.sortValue,
        cell: (_value, row): React.ReactNode => row.value,
        sortDescFirst: true,
      },
    ],
    [],
  );

  const tabs = useMemo<readonly TabbedSectionTab<PlayerStatsTabId>[]>(
    () => [
      {
        id: "stats",
        label: "Leaderboard stats",
        content: (
          <div className={styles.tabContent}>
            {statsRows.length === 0 ? (
              <EmptyContent message="No leaderboard stats found for this server, queue, and time window." />
            ) : (
              <>
                <SortableTable
                  data={statsRows}
                  columns={statColumns}
                  getRowKey={(row, index): string => `${row.stat}-${index.toString()}`}
                  ariaLabel="Player stats table"
                />
                {statsFooter != null && <p className={styles.footer}>{statsFooter}</p>}
              </>
            )}
          </div>
        ),
      },
      {
        id: "head-to-head",
        label: "Head to head",
        content: (
          <div className={styles.tabContent}>
            <div className={styles.relationshipControls}>
              <label>
                <span>Relationship view</span>
                <Select
                  value={selectedRelationshipMetric}
                  onChange={(event): void => {
                    onRelationshipMetricChange(event.target.value);
                  }}
                >
                  {relationshipMetricOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            {relationshipRows.length === 0 ? (
              <EmptyContent message="No head to head data found for this period and queue." />
            ) : (
              <>
                <SortableTable
                  data={relationshipRows}
                  columns={relationshipColumns}
                  getRowKey={(row, index): string => `${row.player}-${index.toString()}`}
                  ariaLabel="Player head to head table"
                />
                {relationshipFooter != null && <p className={styles.footer}>{relationshipFooter}</p>}
              </>
            )}
          </div>
        ),
      },
    ],
    [
      statsRows,
      statColumns,
      statsFooter,
      relationshipRows,
      relationshipColumns,
      relationshipFooter,
      selectedRelationshipMetric,
      relationshipMetricOptions,
      onRelationshipMetricChange,
    ],
  );

  if (state === "error") {
    return (
      <div className={styles.page}>
        <ErrorContent message={errorMessage ?? "Unable to load player stats."} />
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <Heading tagName="h1" variant="display">
            {gamertag}
          </Heading>
          <p className={styles.scope}>{scopeLabel}</p>
        </div>
        <div className={styles.status} data-loading={state === "loading"}>
          {state === "loading" ? "LOADING" : `${statsRows.length.toString()} METRICS`}
        </div>
      </div>

      <div className={styles.controls} aria-label="Player stats filters">
        <label>
          <span>Discord server</span>
          <Select
            value={selectedGuildId}
            onChange={(event): void => {
              onGuildChange(event.target.value);
            }}
          >
            {servers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
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
        {state === "loading" ? (
          <LoadingState text="Loading player stats..." />
        ) : (
          <TabbedSection
            tabs={tabs}
            selectedTabId={selectedTabId}
            tabListAriaLabel="Player stats tabs"
            onTabChange={onTabChange}
          />
        )}
      </section>
    </main>
  );
}
