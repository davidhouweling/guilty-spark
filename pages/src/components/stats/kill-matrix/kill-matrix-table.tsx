import React from "react";
import classNames from "classnames";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { ComponentLoader, ComponentLoaderStatus } from "../../component-loader/component-loader";
import { TeamIcon } from "../../icons/team-icon";
import { SortableTable, type SortableTableColumn } from "../../table/sortable-table";
import tableStyles from "../../table/table.module.css";
import type { TeamColor } from "../../team-colors/team-colors";
import type { KillMatrixPivotData, KillMatrixPivotRow } from "../../../controllers/stats/kill-matrix/types";
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
  readonly killerAxisLabel?: string;
  readonly victimAxisLabel?: string;
  readonly playerHeaders?: readonly PlayerHeader[];
  readonly transposedPivotData?: KillMatrixPivotData;
  readonly teamColors?: readonly TeamColor[];
}

export function KillMatrixTable({
  pivotData,
  ariaLabel,
  emptyMessage,
  errorMessage,
  status,
  killerAxisLabel = "Killer",
  victimAxisLabel = "Deaths",
  playerHeaders,
  transposedPivotData,
  teamColors,
}: KillMatrixTableProps): React.ReactElement {
  const effectiveStatus = status ?? ComponentLoaderStatus.LOADED;

  const [isTransposed, setIsTransposed] = React.useState(false);

  const isTransposedActive = isTransposed && transposedPivotData != null;
  const activePivotData = isTransposedActive ? transposedPivotData : pivotData;
  const activeKillerAxisLabel = isTransposedActive ? "Victim" : killerAxisLabel;
  const activeVictimAxisLabel = isTransposedActive ? "Kills" : victimAxisLabel;

  const teamColorOf = (teamId: number | null): string =>
    (teamId != null ? teamColors?.[teamId]?.hex : undefined) ?? "transparent";

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

  const columns = React.useMemo<SortableTableColumn<KillMatrixPivotRow>[]>(() => {
    if (effectiveStatus !== ComponentLoaderStatus.LOADED) {
      return [];
    }

    const cols: SortableTableColumn<KillMatrixPivotRow>[] = [
      {
        id: "killer",
        header: activeKillerAxisLabel,
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
  }, [effectiveStatus, activeKillerAxisLabel, activePivotData.columnHeaders, teamColors]);

  const playerCount = playerHeaders !== undefined && playerHeaders.length > 0 ? playerHeaders.length : 8;

  const shimmerColumns = React.useMemo<SortableTableColumn<{ index: number }>[]>(() => {
    const cols: SortableTableColumn<{ index: number }>[] = [
      {
        id: "killer",
        header: killerAxisLabel,
        accessorFn: (row): number => row.index,
        enableSorting: false,
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
        id: `victim-${i.toString()}`,
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
        cell: (): React.ReactNode => <div className={styles.shimmerCell} />,
      });
    }

    return cols;
  }, [killerAxisLabel, playerHeaders, playerCount, teamColors]);

  const shimmerRows = React.useMemo(() => Array.from({ length: playerCount }, (_, i) => ({ index: i })), [playerCount]);

  const shimmer = (
    <div role="region" aria-busy="true" aria-label={ariaLabel}>
      <SortableTable data={shimmerRows} columns={shimmerColumns} getRowKey={(row): string => row.index.toString()} />
    </div>
  );

  const loaded =
    activePivotData.tableRows.length === 0 ? (
      <Alert variant="info">{emptyMessage}</Alert>
    ) : (
      <div>
        <div className={styles.tableHeader}>
          <div className={styles.victimAxisLabel}>{activeVictimAxisLabel} →</div>
          {transposedPivotData != null && (
            <Button
              size="small"
              variant="secondary"
              onClick={(): void => {
                setIsTransposed((prev) => !prev);
              }}
            >
              {isTransposedActive ? "Switch to Kills view" : "Switch to Deaths view"}
            </Button>
          )}
        </div>
        <SortableTable
          data={activePivotData.tableRows}
          columns={columns}
          getRowKey={(row): string => row.killerId}
          ariaLabel={ariaLabel}
        />
      </div>
    );

  return (
    <ComponentLoader
      status={effectiveStatus}
      loading={shimmer}
      error={<Alert variant="warning">{errorMessage ?? emptyMessage}</Alert>}
      loaded={loaded}
    />
  );
}
