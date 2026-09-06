import React, { useMemo } from "react";
import { Heading } from "../heading/heading";
import { LoadingState } from "../loading-state/loading-state";
import { Select } from "../select/select";
import { TabbedSection } from "../tabbed-section/tabbed-section";
import type { TabbedSectionTab } from "../tabbed-section/types";
import { SortableTable } from "../table/sortable-table";
import type { SortableTableColumn } from "../table/sortable-table";
import type {
  PlayerLeaderboardStatRow,
  PlayerHeadToHeadTableRow,
  PlayerStatsTabId,
  PlayerStatsViewModel,
} from "./types";
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
  selectedGuildId,
  selectedQueueChannelId,
  selectedWindow,
  selectedMinGamesPlayed,
  minGamesPlayedOptions,
  selectedTabId,
  statsRows,
  headToHeadRows,
  errorMessage,
  statsFooter,
  headToHeadFooter,
  onGuildChange,
  onQueueChange,
  onWindowChange,
  onMinGamesPlayedChange,
  onTabChange,
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

  const headToHeadColumns = useMemo<readonly SortableTableColumn<PlayerHeadToHeadTableRow>[]>(
    () => [
      {
        id: "player",
        header: "Player",
        accessorFn: (row): string => row.player,
        sortDescFirst: false,
      },
      {
        id: "kills",
        header: "H2H Kills",
        accessorFn: (row): number => row.kills,
        cell: (_value, row): React.ReactNode => row.killsText,
        sortDescFirst: true,
      },
      {
        id: "deaths",
        header: "H2H Deaths",
        accessorFn: (row): number => row.deaths,
        cell: (_value, row): React.ReactNode => row.deathsText,
        sortDescFirst: true,
      },
      {
        id: "gamesWith",
        header: "Games with",
        accessorFn: (row): number | undefined => (row.gamesWithTotal === 0 ? undefined : row.gamesWithWinRate),
        cell: (_value, row): React.ReactNode => row.gamesWithText,
        sortDescFirst: true,
        sortUndefined: "last",
      },
      {
        id: "seriesWith",
        header: "Series with",
        accessorFn: (row): number | undefined => (row.seriesWithTotal === 0 ? undefined : row.seriesWithWinRate),
        cell: (_value, row): React.ReactNode => row.seriesWithText,
        sortDescFirst: true,
        sortUndefined: "last",
      },
      {
        id: "gamesAgainst",
        header: "Games vs",
        accessorFn: (row): number | undefined => (row.gamesAgainstTotal === 0 ? undefined : row.gamesAgainstWinRate),
        cell: (_value, row): React.ReactNode => row.gamesAgainstText,
        sortDescFirst: true,
        sortUndefined: "last",
      },
      {
        id: "seriesAgainst",
        header: "Series vs",
        accessorFn: (row): number | undefined => (row.seriesAgainstTotal === 0 ? undefined : row.seriesAgainstWinRate),
        cell: (_value, row): React.ReactNode => row.seriesAgainstText,
        sortDescFirst: true,
        sortUndefined: "last",
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
                  getRowKey={(row): string => row.stat}
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
            {headToHeadRows.length === 0 ? (
              <EmptyContent message="No head to head data found for this period and queue." />
            ) : (
              <>
                <SortableTable
                  data={headToHeadRows}
                  columns={headToHeadColumns}
                  getRowKey={(row): string => row.player}
                  ariaLabel="Player head to head table"
                />
                {headToHeadFooter != null && <p className={styles.footer}>{headToHeadFooter}</p>}
              </>
            )}
          </div>
        ),
      },
    ],
    [statsRows, statColumns, statsFooter, headToHeadRows, headToHeadColumns, headToHeadFooter],
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
        <label>
          <span>Minimum games</span>
          <Select
            value={selectedMinGamesPlayed.toString()}
            onChange={(event): void => {
              onMinGamesPlayedChange(event.target.value);
            }}
          >
            {minGamesPlayedOptions.map((option) => (
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
