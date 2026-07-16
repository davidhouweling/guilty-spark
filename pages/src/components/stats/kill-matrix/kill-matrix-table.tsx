import React from "react";
import classNames from "classnames";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { ComponentLoader, ComponentLoaderStatus } from "../../component-loader/component-loader";
import { TeamIcon } from "../../icons/team-icon";
import { SortableTable, type SortableTableColumn } from "../../table/sortable-table";
import tableStyles from "../../table/table.module.css";
import type { TeamColor } from "../../team-colors/team-colors";
import type {
  KillMatrixCrossTeamData,
  KillMatrixCrossTeamRow,
  KillMatrixPivotData,
  KillMatrixPivotRow,
} from "../../../controllers/stats/kill-matrix/types";
import styles from "./kill-matrix-table.module.css";

interface PlayerHeader {
  readonly gamertag: string;
  readonly teamId: number | null;
}

interface KillMatrixTableProps {
  readonly pivotData: KillMatrixPivotData;
  readonly ariaLabel: string;
  readonly emptyMessage: string;
  readonly errorMessage?: string;
  readonly status?: ComponentLoaderStatus;
  readonly killsAxisLabel?: string;
  readonly deathsAxisLabel?: string;
  readonly playerHeaders?: readonly PlayerHeader[];
  readonly transposedPivotData?: KillMatrixPivotData;
  readonly teamColors?: readonly TeamColor[];
  readonly crossTeamData?: KillMatrixCrossTeamData;
  readonly swappedCrossTeamData?: KillMatrixCrossTeamData;
}

export function KillMatrixTable({
  pivotData,
  ariaLabel,
  emptyMessage,
  errorMessage,
  status,
  killsAxisLabel: killsAxisLabel = "Kills",
  deathsAxisLabel: deathsAxisLabel = "Deaths",
  playerHeaders,
  transposedPivotData,
  teamColors,
  crossTeamData,
  swappedCrossTeamData,
}: KillMatrixTableProps): React.ReactElement {
  const effectiveStatus = status ?? ComponentLoaderStatus.LOADED;

  const [isTransposed, setIsTransposed] = React.useState(false);

  const isTransposedActive = isTransposed && transposedPivotData != null;
  const activePivotData = isTransposedActive ? transposedPivotData : pivotData;
  const yAxisLabel = isTransposedActive ? "Deaths" : killsAxisLabel;
  const xAxisLabel = isTransposedActive ? "Kills" : deathsAxisLabel;

  const teamColorOf = (teamId: number | null): string =>
    (teamId != null ? teamColors?.[teamId]?.hex : undefined) ?? "transparent";

  const xyHeader = (
    <>
      <span className={styles.xAxisLabel}>{xAxisLabel}</span>
      <span className={styles.yAxisLabel}>{yAxisLabel}</span>
      <Button
        variant="secondary"
        className={styles.swap}
        onClick={(event) => {
          event.stopPropagation();
          setIsTransposed(!isTransposed);
        }}
      >
        <svg
          fill="currentColor"
          width="24px"
          height="24px"
          viewBox="0 0 32 32"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M0 30.016v-8q0-0.832 0.576-1.408t1.44-0.608h8q0.8 0 1.408 0.608t0.576 1.408v8q0 0.832-0.576 1.408t-1.408 0.576h-8q-0.832 0-1.44-0.576t-0.576-1.408zM0.032 10.368q-0.096-0.608 0.128-1.152t0.704-0.864 1.152-0.352h1.984q0-2.464 1.76-4.224t4.256-1.76h4q0.704 0 1.216 0.416t0.64 0.992 0 1.184-0.64 0.992-1.216 0.416h-4q-0.832 0-1.44 0.576t-0.576 1.408h2.016q0.64 0 1.152 0.384t0.704 0.864 0.096 1.12-0.544 1.056l-4 4q-0.64 0.608-1.44 0.608t-1.376-0.608l-4-4q-0.48-0.448-0.576-1.056zM4 28h4v-4h-4v4zM16.128 28.608q-0.096-0.608 0-1.184t0.64-0.992 1.248-0.416h4q0.8 0 1.408-0.576t0.576-1.44h-1.984q-0.672 0-1.184-0.352t-0.704-0.896-0.096-1.12 0.576-1.024l4-4q0.608-0.608 1.408-0.608t1.408 0.576l4 4q0.48 0.48 0.576 1.088t-0.16 1.12-0.704 0.864-1.12 0.352h-2.016q0 2.496-1.76 4.256t-4.224 1.76h-4q-0.736 0-1.248-0.416t-0.64-0.992zM20 10.016v-8q0-0.832 0.576-1.408t1.44-0.608h8q0.8 0 1.408 0.608t0.576 1.408v8q0 0.832-0.576 1.408t-1.408 0.576h-8q-0.832 0-1.44-0.576t-0.576-1.408zM24 8h4v-4h-4v4z"></path>
        </svg>
      </Button>
    </>
  );

  const renderPlayerHeader = (gamertag: string, teamId: number | null): React.ReactNode => (
    <span className={styles.playerHeader}>
      {teamId != null && <TeamIcon teamId={teamId} size="x-small" />}
      {gamertag}
    </span>
  );

  const rowTeamStyle = (teamId: number | null): React.CSSProperties =>
    ({ "--row-team-color": teamColorOf(teamId) }) as React.CSSProperties;

  const colTeamStyle = (teamId: number | null): React.CSSProperties =>
    ({ "--col-team-color": teamColorOf(teamId) }) as React.CSSProperties;

  const cellTeamStyle = (rowTeamId: number | null, colTeamId: number | null): React.CSSProperties =>
    ({ "--row-team-color": teamColorOf(rowTeamId), "--col-team-color": teamColorOf(colTeamId) }) as React.CSSProperties;

  const activeCrossTeamData =
    crossTeamData != null
      ? isTransposed && swappedCrossTeamData != null
        ? swappedCrossTeamData
        : crossTeamData
      : null;

  const renderCrossTeamCell = (kills: number, deaths: number): React.ReactNode => (
    <span className={styles.crossTeamCell}>
      {kills}
      <span className={styles.crossTeamSeparator}>:</span>
      {deaths}
    </span>
  );

  const crossTeamColumns = React.useMemo<SortableTableColumn<KillMatrixCrossTeamRow>[]>(() => {
    if (effectiveStatus !== ComponentLoaderStatus.LOADED || activeCrossTeamData == null) {
      return [];
    }

    const cols: SortableTableColumn<KillMatrixCrossTeamRow>[] = [
      {
        id: "xyHeader",
        header: xyHeader,
        accessorFn: (row: KillMatrixCrossTeamRow): string => row.playerGamertag,
        sortingFn: "alphanumeric",
        cellClassName: classNames(tableStyles.labelCell, styles.killerCell),
        cellStyle:
          teamColors != null
            ? (row: KillMatrixCrossTeamRow): React.CSSProperties => rowTeamStyle(row.playerTeamId)
            : undefined,
        cell: (_value: unknown, row: KillMatrixCrossTeamRow): React.ReactNode =>
          renderPlayerHeader(row.playerGamertag, row.playerTeamId),
      },
    ];

    for (const { gamertag, teamId } of activeCrossTeamData.columnHeaders) {
      const colTeamId: number | null = teamId;
      cols.push({
        id: gamertag,
        header: renderPlayerHeader(gamertag, colTeamId),
        headerClassName: styles.colHeader,
        headerStyle: teamColors != null ? colTeamStyle(colTeamId) : undefined,
        accessorFn: (row: KillMatrixCrossTeamRow): number => row.cells.get(gamertag)?.kills ?? 0,
        sortingFn: "basic",
        cellClassName: styles.killCell,
        cellStyle:
          teamColors != null
            ? (row: KillMatrixCrossTeamRow): React.CSSProperties => cellTeamStyle(row.playerTeamId, colTeamId)
            : undefined,
        cell: (_value: unknown, row: KillMatrixCrossTeamRow): React.ReactNode => {
          const cell = row.cells.get(gamertag);
          return renderCrossTeamCell(cell?.kills ?? 0, cell?.deaths ?? 0);
        },
      });
    }

    return cols;
  }, [effectiveStatus, xAxisLabel, yAxisLabel, activeCrossTeamData, teamColors]);

  const columns = React.useMemo<SortableTableColumn<KillMatrixPivotRow>[]>(() => {
    if (effectiveStatus !== ComponentLoaderStatus.LOADED) {
      return [];
    }

    const cols: SortableTableColumn<KillMatrixPivotRow>[] = [
      {
        id: "xyHeader",
        header: xyHeader,
        accessorFn: (row: KillMatrixPivotRow): string => row.killerGamertag,
        sortingFn: "alphanumeric",
        cellClassName: classNames(tableStyles.labelCell, styles.killerCell),
        cellStyle:
          teamColors != null
            ? (row: KillMatrixPivotRow): React.CSSProperties => rowTeamStyle(row.killerTeamId)
            : undefined,
        cell: (_value: unknown, row: KillMatrixPivotRow): React.ReactNode =>
          renderPlayerHeader(row.killerGamertag, row.killerTeamId),
      },
    ];

    for (const { gamertag, teamId } of activePivotData.columnHeaders) {
      const colTeamId: number | null = teamId;
      cols.push({
        id: gamertag,
        header: renderPlayerHeader(gamertag, colTeamId),
        headerClassName: styles.colHeader,
        headerStyle: teamColors != null ? colTeamStyle(colTeamId) : undefined,
        accessorFn: (row: KillMatrixPivotRow): number => row.kills.get(gamertag) ?? 0,
        sortingFn: "basic",
        cellClassName: styles.killCell,
        cellStyle:
          teamColors != null
            ? (row: KillMatrixPivotRow): React.CSSProperties => cellTeamStyle(row.killerTeamId, colTeamId)
            : undefined,
      });
    }

    return cols;
  }, [effectiveStatus, yAxisLabel, activePivotData.columnHeaders, teamColors]);

  const firstTeamId = playerHeaders?.[0]?.teamId ?? null;
  const crossTeamRowHeaders = playerHeaders?.filter((h) => h.teamId === firstTeamId) ?? [];
  const crossTeamColHeaders = playerHeaders?.filter((h) => h.teamId !== firstTeamId) ?? [];
  const crossTeamRowCount = crossTeamRowHeaders.length > 0 ? crossTeamRowHeaders.length : 4;
  const crossTeamColCount = crossTeamColHeaders.length > 0 ? crossTeamColHeaders.length : 4;

  const crossTeamShimmerColumns = React.useMemo<SortableTableColumn<{ index: number }>[]>(() => {
    const rowHeaders = isTransposed ? crossTeamColHeaders : crossTeamRowHeaders;
    const colHeaders = isTransposed ? crossTeamRowHeaders : crossTeamColHeaders;
    const cols: SortableTableColumn<{ index: number }>[] = [
      {
        id: "xyHeader",
        header: xyHeader,
        accessorFn: (row): number => row.index,
        sortingFn: "alphanumeric",
        cellClassName: classNames(tableStyles.labelCell, styles.killerCell),
        cellStyle:
          teamColors != null
            ? (row): React.CSSProperties =>
                rowTeamStyle(row.index < rowHeaders.length ? rowHeaders[row.index].teamId : null)
            : undefined,
        cell: (_value, row): React.ReactNode => {
          const ph = row.index < rowHeaders.length ? rowHeaders[row.index] : null;
          return renderPlayerHeader(ph?.gamertag ?? "", ph?.teamId ?? null);
        },
      },
    ];

    const shimmerColCount =
      colHeaders.length > 0 ? colHeaders.length : isTransposed ? crossTeamRowCount : crossTeamColCount;
    for (let i = 0; i < shimmerColCount; i++) {
      const header = i < colHeaders.length ? colHeaders[i] : null;
      const colTeamId = header?.teamId ?? null;
      cols.push({
        id: `col-${i.toString()}`,
        header: header != null ? renderPlayerHeader(header.gamertag, colTeamId) : null,
        headerClassName: styles.colHeader,
        headerStyle: teamColors != null ? colTeamStyle(colTeamId) : undefined,
        accessorFn: (): number => 0,
        enableSorting: false,
        cellClassName: styles.killCell,
        cellStyle:
          teamColors != null
            ? (row): React.CSSProperties =>
                cellTeamStyle(row.index < rowHeaders.length ? rowHeaders[row.index].teamId : null, colTeamId)
            : undefined,
        cell: (): React.ReactNode => (
          <span className={styles.shimmerContainer}>
            <span className={styles.shimmerCell} />
          </span>
        ),
      });
    }

    return cols;
  }, [
    xAxisLabel,
    yAxisLabel,
    crossTeamRowHeaders,
    crossTeamColHeaders,
    crossTeamRowCount,
    crossTeamColCount,
    isTransposed,
    teamColors,
  ]);

  const activeRowCount = crossTeamData != null ? (isTransposed ? crossTeamColCount : crossTeamRowCount) : undefined;
  const crossTeamShimmerRows = React.useMemo(
    () => Array.from({ length: activeRowCount ?? crossTeamRowCount }, (_, i) => ({ index: i })),
    [activeRowCount, crossTeamRowCount],
  );

  const buildFootnoteText = (footnote: { betrayals: number; suicides: number }): string => {
    const parts: string[] = [];
    if (footnote.betrayals > 0) {
      parts.push(`${footnote.betrayals.toString()} betrayal${footnote.betrayals !== 1 ? "s" : ""}`);
    }
    if (footnote.suicides > 0) {
      parts.push(`${footnote.suicides.toString()} suicide${footnote.suicides !== 1 ? "s" : ""}`);
    }
    return `* Excluded from table: ${parts.join(", ")}`;
  };

  const playerCount = playerHeaders !== undefined && playerHeaders.length > 0 ? playerHeaders.length : 8;

  const shimmerColumns = React.useMemo<SortableTableColumn<{ index: number }>[]>(() => {
    const cols: SortableTableColumn<{ index: number }>[] = [
      {
        id: "xyHeader",
        header: xyHeader,
        accessorFn: (row): number => row.index,
        sortingFn: "alphanumeric",
        cellClassName: classNames(tableStyles.labelCell, styles.killerCell),
        cellStyle:
          teamColors != null
            ? (row): React.CSSProperties => rowTeamStyle(playerHeaders?.[row.index]?.teamId ?? null)
            : undefined,
        cell: (_value, row): React.ReactNode => {
          const ph = playerHeaders?.[row.index];
          return renderPlayerHeader(ph?.gamertag ?? "", ph?.teamId ?? null);
        },
      },
    ];

    for (let i = 0; i < playerCount; i++) {
      const header = playerHeaders?.[i];
      const colTeamId = header?.teamId ?? null;
      cols.push({
        id: `col-${i.toString()}`,
        header: renderPlayerHeader(header?.gamertag ?? "", colTeamId),
        headerClassName: styles.colHeader,
        headerStyle: teamColors != null ? colTeamStyle(colTeamId) : undefined,
        accessorFn: (): number => 0,
        enableSorting: false,
        cellClassName: styles.killCell,
        cellStyle:
          teamColors != null
            ? (row): React.CSSProperties => cellTeamStyle(playerHeaders?.[row.index]?.teamId ?? null, colTeamId)
            : undefined,
        cell: (): React.ReactNode => (
          <span className={styles.shimmerContainer}>
            <span className={styles.shimmerCell} />
          </span>
        ),
      });
    }

    return cols;
  }, [yAxisLabel, playerHeaders, teamColors]);

  const shimmerRows = React.useMemo(() => Array.from({ length: playerCount }, (_, i) => ({ index: i })), [playerCount]);

  const shimmer = (
    <div role="region" aria-busy="true" aria-label={ariaLabel}>
      <SortableTable
        data={shimmerRows}
        columns={shimmerColumns}
        getRowKey={(row): string => row.index.toString()}
        ariaLabel={ariaLabel}
      />
    </div>
  );

  const footnoteText = activeCrossTeamData?.footnote != null ? buildFootnoteText(activeCrossTeamData.footnote) : null;

  const crossTeamLoaded =
    activeCrossTeamData == null || activeCrossTeamData.tableRows.length === 0 ? (
      <Alert variant="info">{emptyMessage}</Alert>
    ) : (
      <>
        <SortableTable
          data={activeCrossTeamData.tableRows}
          columns={crossTeamColumns}
          getRowKey={(row): string => row.playerId}
          ariaLabel={ariaLabel}
        />
        {footnoteText != null && <p className={styles.footnote}>{footnoteText}</p>}
      </>
    );

  const crossTeamShimmer = (
    <div role="region" aria-busy="true" aria-label={ariaLabel}>
      <SortableTable
        data={crossTeamShimmerRows}
        columns={crossTeamShimmerColumns}
        getRowKey={(row): string => row.index.toString()}
        ariaLabel={ariaLabel}
      />
    </div>
  );

  const loaded =
    activePivotData.tableRows.length === 0 ? (
      <Alert variant="info">{emptyMessage}</Alert>
    ) : (
      <SortableTable
        data={activePivotData.tableRows}
        columns={columns}
        getRowKey={(row): string => row.killerId}
        ariaLabel={ariaLabel}
      />
    );

  const isCrossTeam = crossTeamData != null;

  return (
    <ComponentLoader
      status={effectiveStatus}
      loading={isCrossTeam ? crossTeamShimmer : shimmer}
      error={<Alert variant="warning">{errorMessage ?? emptyMessage}</Alert>}
      loaded={isCrossTeam ? crossTeamLoaded : loaded}
    />
  );
}
