import React, { useMemo } from "react";
import { Alert } from "../alert/alert";
import { Button } from "../button/button";
import { CloseButton } from "../close-button/close-button";
import { Heading } from "../heading/heading";
import { Input } from "../input/input";
import { LoadingState } from "../loading-state/loading-state";
import { Select } from "../select/select";
import { TabbedSection } from "../tabbed-section/tabbed-section";
import type { TabbedSectionTab } from "../tabbed-section/types";
import { SortableTable } from "../table/sortable-table";
import type { SortableTableColumn } from "../table/sortable-table";
import type {
  PlayerCompareHeadToHeadCell,
  PlayerCompareHeadToHeadRow,
  PlayerCompareStatRow,
  PlayerCompareTabId,
  PlayerCompareValueCell,
  PlayerCompareViewModel,
} from "./types";
import styles from "./player-compare.module.css";

function EmptyContent(): React.ReactElement {
  return (
    <div className={styles.empty}>
      <Heading tagName="h2" variant="display">
        Add players to compare
      </Heading>
      <p>Enter a gamertag to compare leaderboard stats.</p>
    </div>
  );
}

function getCompareValue(row: PlayerCompareStatRow, gamertag: string): PlayerCompareValueCell | undefined {
  return row.values.find((value) => value.gamertag === gamertag);
}

function getHeadToHeadValue(
  row: PlayerCompareHeadToHeadRow,
  opponentGamertag: string,
): PlayerCompareHeadToHeadCell | undefined {
  return row.values.find((value) => value.opponentGamertag === opponentGamertag);
}

function createPlayerColumn(
  gamertag: string,
  onRemovePlayer: (value: string) => void,
): SortableTableColumn<PlayerCompareStatRow> {
  return {
    id: gamertag,
    headerClassName: styles.playerHeaderCell,
    header: (
      <div className={styles.playerHeader}>
        <span>{gamertag}</span>
        <CloseButton
          ariaLabel={`Remove ${gamertag}`}
          className={styles.playerHeaderRemoveButton}
          onClick={(event): void => {
            event.stopPropagation();
            onRemovePlayer(gamertag);
          }}
        />
      </div>
    ),
    accessorFn: (row): number | undefined => getCompareValue(row, gamertag)?.sortValue,
    cell: (_value, row): React.ReactNode => getCompareValue(row, gamertag)?.text ?? "-",
    cellClassName: (row): string => {
      const comparison = getCompareValue(row, gamertag)?.comparison;
      if (comparison === "best") {
        return styles.bestValue;
      }
      if (comparison === "worst") {
        return styles.worstValue;
      }

      return "";
    },
    sortDescFirst: true,
    sortUndefined: "last",
  };
}

function getComparisonClass(comparison: "best" | "worst" | undefined): string {
  if (comparison === "best") {
    return styles.bestValue;
  }
  if (comparison === "worst") {
    return styles.worstValue;
  }

  return "";
}

function createHeadToHeadColumn(gamertag: string): SortableTableColumn<PlayerCompareHeadToHeadRow> {
  return {
    id: gamertag,
    header: gamertag,
    accessorFn: (row): number | undefined => getHeadToHeadValue(row, gamertag)?.sortValue,
    cell: (_value, row): React.ReactNode => getHeadToHeadValue(row, gamertag)?.text ?? "-",
    cellClassName: (row): string => getComparisonClass(getHeadToHeadValue(row, gamertag)?.comparison),
    sortDescFirst: true,
    sortUndefined: "last",
  };
}

export function PlayerCompare({
  state,
  errorMessage,
  gamertags,
  title,
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
  headToHeadSummaryRows = [],
  headToHeadMetricOptions,
  selectedHeadToHeadMetric,
  headToHeadRows,
  addPlayerValue,
  canAddPlayer,
  statusText,
  onAddPlayerValueChange,
  onAddPlayer,
  onRemovePlayer,
  onGuildChange,
  onQueueChange,
  onWindowChange,
  onMinGamesPlayedChange,
  onHeadToHeadMetricChange,
  onTabChange,
}: PlayerCompareViewModel): React.ReactElement {
  const statColumns = useMemo<readonly SortableTableColumn<PlayerCompareStatRow>[]>(
    () => [
      {
        id: "stat",
        header: "Stat",
        accessorFn: (row): string => row.stat,
        sortDescFirst: false,
      },
      ...gamertags.map((gamertag) => createPlayerColumn(gamertag, onRemovePlayer)),
    ],
    [gamertags, onRemovePlayer],
  );

  const headToHeadColumns = useMemo<readonly SortableTableColumn<PlayerCompareHeadToHeadRow>[]>(
    () => [
      {
        id: "player",
        header: "Player",
        accessorFn: (row): string => row.playerGamertag,
        sortDescFirst: false,
      },
      ...gamertags.map((gamertag) => createHeadToHeadColumn(gamertag)),
    ],
    [gamertags],
  );

  const tabs = useMemo<readonly TabbedSectionTab<PlayerCompareTabId>[]>(
    () => [
      {
        id: "stats",
        label: "Leaderboard stats",
        content: (
          <div className={styles.tabContent}>
            {statsRows.length === 0 ? (
              <EmptyContent />
            ) : (
              <SortableTable
                data={statsRows}
                columns={statColumns}
                getRowKey={(row): string => row.stat}
                ariaLabel="Player comparison table"
              />
            )}
          </div>
        ),
      },
      {
        id: "head-to-head",
        label: "Head to head",
        content: (
          <div className={styles.tabContent}>
            {gamertags.length === 2 ? (
              headToHeadSummaryRows.length === 0 ? (
                <EmptyContent />
              ) : (
                <SortableTable
                  data={headToHeadSummaryRows}
                  columns={statColumns}
                  getRowKey={(row): string => row.stat}
                  ariaLabel="Player comparison table"
                />
              )
            ) : headToHeadRows.length === 0 ? (
              <EmptyContent />
            ) : (
              <>
                <label className={styles.metricSelect}>
                  <span>Metric</span>
                  <Select
                    value={selectedHeadToHeadMetric}
                    onChange={(event): void => {
                      onHeadToHeadMetricChange(event.target.value);
                    }}
                  >
                    {headToHeadMetricOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <SortableTable
                  data={headToHeadRows}
                  columns={headToHeadColumns}
                  getRowKey={(row): string => row.playerGamertag}
                  ariaLabel="Player head-to-head comparison matrix"
                />
              </>
            )}
          </div>
        ),
      },
    ],
    [
      gamertags.length,
      headToHeadColumns,
      headToHeadMetricOptions,
      headToHeadRows,
      headToHeadSummaryRows,
      onHeadToHeadMetricChange,
      selectedHeadToHeadMetric,
      statColumns,
      statsRows,
    ],
  );

  if (state === "error") {
    return (
      <div className={styles.page}>
        <Alert variant="error">{errorMessage ?? "Unable to load player comparison."}</Alert>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <Heading tagName="h1" variant="display">
        {title}
      </Heading>
      <p className={styles.scope}>{scopeLabel}</p>
      <div className={styles.headerActions}>
        <div className={styles.status} data-loading={state === "loading"}>
          {statusText}
        </div>
        <form
          className={styles.addPlayer}
          onSubmit={(event): void => {
            event.preventDefault();
            onAddPlayer();
          }}
        >
          <Input
            label="Gamertag"
            labelClassName={styles.formLabel}
            value={addPlayerValue}
            placeholder="Add player"
            onChange={(event): void => {
              onAddPlayerValueChange(event.target.value);
            }}
          />
          <Button type="submit" disabled={!canAddPlayer}>
            Add player
          </Button>
        </form>
      </div>

      {servers.length > 0 && (
        <div className={styles.controls} aria-label="Player comparison filters">
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
      )}

      <section className={styles.tableSection}>
        {state === "loading" ? (
          <LoadingState text="Loading player comparison..." />
        ) : (
          <TabbedSection
            tabs={tabs}
            selectedTabId={selectedTabId}
            tabListAriaLabel="Player comparison tabs"
            onTabChange={onTabChange}
          />
        )}
      </section>
    </main>
  );
}
