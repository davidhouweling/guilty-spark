import React from "react";
import { Alert } from "../../alert/alert";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { SortableTable, type SortableTableColumn } from "../../table/sortable-table";
import tableStyles from "../../table/table.module.css";
import type { KillMatrixPivotData, KillMatrixPivotRow } from "../../../controllers/stats/kill-matrix/types";
import styles from "./kill-matrix-table.module.css";

interface KillMatrixTableProps {
  readonly pivotData: KillMatrixPivotData;
  readonly ariaLabel: string;
  readonly emptyMessage: string;
  readonly status?: ComponentLoaderStatus;
  readonly killerAxisLabel?: string;
  readonly victimAxisLabel?: string;
  readonly playerGamertags?: readonly string[];
}

export function KillMatrixTable({
  pivotData,
  ariaLabel,
  emptyMessage,
  status,
  killerAxisLabel = "Killer",
  victimAxisLabel = "Deaths",
  playerGamertags,
}: KillMatrixTableProps): React.ReactElement {
  const isLoading = status === ComponentLoaderStatus.LOADING || status === ComponentLoaderStatus.PENDING;
  const isError = status === ComponentLoaderStatus.ERROR;

  const columns = React.useMemo<SortableTableColumn<KillMatrixPivotRow>[]>(() => {
    if (isLoading) {
      return [];
    }

    const cols: SortableTableColumn<KillMatrixPivotRow>[] = [
      {
        id: "killer",
        header: killerAxisLabel,
        accessorFn: (row): string => row.killerGamertag,
        sortingFn: "alphanumeric",
        cellClassName: tableStyles.labelCell,
      },
    ];

    for (const victimGamertag of pivotData.victimGamertags) {
      cols.push({
        id: victimGamertag,
        header: victimGamertag,
        accessorFn: (row): number => row[victimGamertag] as number,
        sortingFn: "basic",
        cellClassName: styles.killCell,
      });
    }

    return cols;
  }, [isLoading, killerAxisLabel, pivotData.victimGamertags]);

  if (isLoading) {
    const rowCount = playerGamertags?.length ?? 5;
    return (
      <div className={styles.shimmerContainer} aria-busy="true" aria-label={ariaLabel}>
        {Array.from({ length: rowCount }, (_, i) => {
          const gamertag = playerGamertags?.[i];
          return (
            <div key={gamertag ?? i} className={styles.shimmerRow}>
              {gamertag}
            </div>
          );
        })}
      </div>
    );
  }

  if (isError) {
    return <Alert variant="warning">{emptyMessage}</Alert>;
  }

  if (pivotData.tableRows.length === 0) {
    return <Alert variant="info">{emptyMessage}</Alert>;
  }

  return (
    <div>
      <div className={styles.victimAxisLabel}>{victimAxisLabel} →</div>
      <SortableTable
        data={pivotData.tableRows}
        columns={columns}
        getRowKey={(row): string => row.killerId}
        ariaLabel={ariaLabel}
      />
    </div>
  );
}
