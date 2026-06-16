import React from "react";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { Alert } from "../../alert/alert";
import { SortableTable, type SortableTableColumn } from "../../table/sortable-table";
import tableStyles from "../../table/table.module.css";
import type { KillMatrixViewRow } from "../../../controllers/stats/kill-matrix/types";
import styles from "./kill-matrix-table.module.css";

interface KillMatrixTableProps {
  readonly rows: readonly KillMatrixViewRow[];
  readonly ariaLabel: string;
  readonly emptyMessage: string;
}

interface MatrixRow {
  readonly killerId: string;
  readonly killerGamertag: string;
  [victimGamertag: string]: string | number;
}

export function KillMatrixTable({ rows, ariaLabel, emptyMessage }: KillMatrixTableProps): React.ReactElement {
  // Build a pivot table structure: killers x victims with kill counts
  const matrixData = React.useMemo(() => {
    if (rows.length === 0) {
      return { tableRows: [], victimGamertags: [] };
    }

    // Extract unique killers and victims
    const killersMap = new Map<string, string>();
    const victimsMap = new Map<string, string>();
    const killCounts = new Map<string, Map<string, number>>();

    for (const row of rows) {
      killersMap.set(row.killer.xuid, row.killer.gamertag);
      victimsMap.set(row.victim.xuid, row.victim.gamertag);

      if (!killCounts.has(row.killer.xuid)) {
        killCounts.set(row.killer.xuid, new Map());
      }
      const victimCounts = Preconditions.checkExists(killCounts.get(row.killer.xuid));
      victimCounts.set(row.victim.xuid, row.count);
    }

    // Sort killers and victims alphabetically
    const sortedKillers = Array.from(killersMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    const sortedVictims = Array.from(victimsMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));

    // Build table rows
    const tableRows: MatrixRow[] = sortedKillers.map(([killerId, killerGamertag]) => {
      const row: MatrixRow = {
        killerId,
        killerGamertag,
      };

      const victimCounts = killCounts.get(killerId) ?? new Map();
      for (const [victimId, victimGamertag] of sortedVictims) {
        row[victimGamertag] = victimCounts.get(victimId) ?? 0;
      }

      return row;
    });

    const victimGamertags = sortedVictims.map(([, gamertag]) => gamertag);

    return { tableRows, victimGamertags };
  }, [rows]);

  const columns = React.useMemo<SortableTableColumn<MatrixRow>[]>(() => {
    const cols: SortableTableColumn<MatrixRow>[] = [
      {
        id: "killer",
        header: "Killer",
        accessorFn: (row): string => row.killerGamertag,
        sortingFn: "alphanumeric",
        cellClassName: tableStyles.labelCell,
      },
    ];

    // Add a column for each victim
    for (const victimGamertag of matrixData.victimGamertags) {
      cols.push({
        id: victimGamertag,
        header: victimGamertag,
        accessorFn: (row): number => row[victimGamertag] as number,
        sortingFn: "basic",
        cellClassName: styles.killCell,
      });
    }

    return cols;
  }, [matrixData.victimGamertags]);

  if (matrixData.tableRows.length === 0) {
    return <Alert variant="info">{emptyMessage}</Alert>;
  }

  return (
    <SortableTable
      data={matrixData.tableRows}
      columns={columns}
      getRowKey={(row): string => row.killerId}
      ariaLabel={ariaLabel}
    />
  );
}
