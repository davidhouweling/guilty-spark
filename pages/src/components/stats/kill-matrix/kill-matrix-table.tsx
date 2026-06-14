import React from "react";
import classNames from "classnames";
import { Alert } from "../../alert/alert";
import { SortableTable, type SortableTableColumn } from "../../table/sortable-table";
import tableStyles from "../../table/table.module.css";
import type { KillMatrixViewRow } from "./types";
import styles from "./kill-matrix-table.module.css";

interface KillMatrixTableProps {
  readonly rows: readonly KillMatrixViewRow[];
  readonly ariaLabel: string;
  readonly emptyMessage: string;
}

export function KillMatrixTable({ rows, ariaLabel, emptyMessage }: KillMatrixTableProps): React.ReactElement {
  const columns = React.useMemo<SortableTableColumn<KillMatrixViewRow>[]>(() => {
    return [
      {
        id: "killer",
        header: "Killer",
        accessorFn: (row): string => row.killer.gamertag,
        sortingFn: "alphanumeric",
        cellClassName: tableStyles.labelCell,
      },
      {
        id: "victim",
        header: "Victim",
        accessorFn: (row): string => row.victim.gamertag,
        sortingFn: "alphanumeric",
        cellClassName: tableStyles.labelCell,
      },
      {
        id: "count",
        header: "Kills",
        accessorFn: (row): number => row.count,
        sortingFn: "basic",
        cellClassName: classNames(tableStyles.statCell, styles.rowCount),
      },
      {
        id: "headshotKills",
        header: "HS",
        accessorFn: (row): number => row.headshotKills,
        sortingFn: "basic",
        cellClassName: classNames(tableStyles.statCell, styles.rowCount),
      },
      {
        id: "perfects",
        header: "Perfects",
        accessorFn: (row): number => row.perfects,
        sortingFn: "basic",
        cellClassName: classNames(tableStyles.statCell, styles.rowCount),
      },
      {
        id: "classification",
        header: "Type",
        accessorFn: (row): string => row.classification,
        sortingFn: "alphanumeric",
        cellClassName: tableStyles.statCell,
        cell: (value): React.ReactNode => String(value).replace("-", " "),
      },
    ];
  }, []);

  if (rows.length === 0) {
    return <Alert variant="info">{emptyMessage}</Alert>;
  }

  return <SortableTable data={rows} columns={columns} getRowKey={(row): string => row.key} ariaLabel={ariaLabel} />;
}
