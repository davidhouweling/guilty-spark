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
}

export function KillMatrixTable({ pivotData, ariaLabel, emptyMessage }: KillMatrixTableProps): React.ReactElement {
  const columns = React.useMemo<SortableTableColumn<KillMatrixPivotRow>[]>(() => {
    const cols: SortableTableColumn<KillMatrixPivotRow>[] = [
      {
        id: "killer",
        header: "Killer",
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
  }, [pivotData.victimGamertags]);

  if (pivotData.tableRows.length === 0) {
    return <Alert variant="info">{emptyMessage}</Alert>;
  }

  return (
    <SortableTable
      data={pivotData.tableRows}
      columns={columns}
      getRowKey={(row): string => row.killerId}
      ariaLabel={ariaLabel}
    />
  );
}
