import React from "react";
import { Alert } from "../../alert/alert";
import { SortableTable, type SortableTableColumn } from "../../table/sortable-table";
import tableStyles from "../../table/table.module.css";
import type { KillMatrixPivotData, KillMatrixPivotRow } from "../../../controllers/stats/kill-matrix/types";
import styles from "./kill-matrix-table.module.css";

interface KillMatrixTableProps {
  readonly pivotData: KillMatrixPivotData;
  readonly ariaLabel: string;
  readonly emptyMessage: string;
  readonly loading?: boolean;
  readonly killerAxisLabel?: string;
  readonly victimAxisLabel?: string;
}

export function KillMatrixTable({
  pivotData,
  ariaLabel,
  emptyMessage,
  loading,
  killerAxisLabel = "Kills",
  victimAxisLabel = "Deaths",
}: KillMatrixTableProps): React.ReactElement {
  const columns = React.useMemo<SortableTableColumn<KillMatrixPivotRow>[]>(() => {
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
  }, [killerAxisLabel, pivotData.victimGamertags]);

  if (loading === true) {
    return (
      <div className={styles.shimmerContainer} aria-busy="true" aria-label={ariaLabel}>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={styles.shimmerRow} />
        ))}
      </div>
    );
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
