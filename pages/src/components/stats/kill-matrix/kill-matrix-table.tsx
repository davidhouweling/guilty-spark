import React from "react";
import { Alert } from "../../alert/alert";
import { ComponentLoader, ComponentLoaderStatus } from "../../component-loader/component-loader";
import { SortableTable, type SortableTableColumn } from "../../table/sortable-table";
import tableStyles from "../../table/table.module.css";
import type { KillMatrixPivotData, KillMatrixPivotRow } from "../../../controllers/stats/kill-matrix/types";
import styles from "./kill-matrix-table.module.css";

interface KillMatrixTableProps {
  readonly pivotData: KillMatrixPivotData;
  readonly ariaLabel: string;
  readonly emptyMessage: string;
  readonly errorMessage?: string;
  readonly status?: ComponentLoaderStatus;
  readonly killerAxisLabel?: string;
  readonly victimAxisLabel?: string;
  readonly playerGamertags?: readonly string[];
}

export function KillMatrixTable({
  pivotData,
  ariaLabel,
  emptyMessage,
  errorMessage,
  status,
  killerAxisLabel = "Killer",
  victimAxisLabel = "Deaths",
  playerGamertags,
}: KillMatrixTableProps): React.ReactElement {
  const effectiveStatus = status ?? ComponentLoaderStatus.LOADED;

  const columns = React.useMemo<SortableTableColumn<KillMatrixPivotRow>[]>(() => {
    if (effectiveStatus !== ComponentLoaderStatus.LOADED) {
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
  }, [effectiveStatus, killerAxisLabel, pivotData.victimGamertags]);

  const playerCount = playerGamertags !== undefined && playerGamertags.length > 0 ? playerGamertags.length : 8;

  const shimmer = (
    <div
      role="region"
      className={styles.shimmerContainer}
      style={{ "--shimmer-cols": playerCount } as React.CSSProperties}
      aria-busy="true"
      aria-label={ariaLabel}
    >
      <div className={styles.shimmerHeaderCell}>{killerAxisLabel}</div>
      {Array.from({ length: playerCount }, (_, i) => (
        <div key={i} className={styles.shimmerHeaderCell}>
          {playerGamertags?.[i]}
        </div>
      ))}
      {Array.from({ length: playerCount }, (_, row) => (
        <React.Fragment key={row}>
          <div className={styles.shimmerLabelCell}>{playerGamertags?.[row]}</div>
          {Array.from({ length: playerCount }, (_col, col) => (
            <div key={col} className={styles.shimmerCell} />
          ))}
        </React.Fragment>
      ))}
    </div>
  );

  const loaded =
    pivotData.tableRows.length === 0 ? (
      <Alert variant="info">{emptyMessage}</Alert>
    ) : (
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

  return (
    <ComponentLoader
      status={effectiveStatus}
      loading={shimmer}
      error={<Alert variant="warning">{errorMessage ?? emptyMessage}</Alert>}
      loaded={loaded}
    />
  );
}
