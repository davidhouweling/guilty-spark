import React from "react";
import classNames from "classnames";
import styles from "./table.module.css";

export interface TableColumn<TData> {
  /** Unique identifier for the column */
  id: string;
  /** Header label to display */
  header: string;
  /** Function to extract cell value from row data */
  cell: (row: TData) => React.ReactNode;
  /** Optional CSS class for header cells */
  headerClassName?: string;
  /** Optional CSS class for body cells */
  cellClassName?: string;
}

export interface TableProps<TData> {
  /** Array of data rows */
  data: readonly TData[];
  /** Column definitions */
  columns: readonly TableColumn<TData>[];
  /** Optional CSS class for the wrapper */
  className?: string;
  /** Optional function to generate unique keys for rows */
  getRowKey?: (row: TData, index: number) => string;
  /** Optional ARIA label for the table */
  ariaLabel?: string;
}

/**
 * Base table component with consistent styling.
 * For sortable tables, use SortableTable instead.
 */
export function Table<TData>({
  data,
  columns,
  className,
  getRowKey = (_, index): string => index.toString(),
  ariaLabel,
}: TableProps<TData>): React.ReactElement {
  return (
    <div className={classNames(styles.tableWrapper, className)}>
      <table className={styles.table} aria-label={ariaLabel}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.id} className={column.headerClassName}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={getRowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.id} className={column.cellClassName}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
