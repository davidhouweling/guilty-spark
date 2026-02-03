import React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type SortDirection,
} from "@tanstack/react-table";
import classNames from "classnames";
import styles from "./table.module.css";

export interface SortableTableColumn<TData> extends Omit<ColumnDef<TData>, "id" | "header" | "cell"> {
  /** Unique identifier for the column */
  id: string;
  /** Header label to display */
  header: string;
  /** Function to extract cell value from row data */
  accessorFn: (row: TData) => unknown;
  /** Function to render cell content (optional, defaults to displaying the value) */
  cell?: (value: unknown, row: TData) => React.ReactNode;
  /** Optional CSS class for header cells */
  headerClassName?: string;
  /** Optional CSS class for body cells (can be a function for dynamic classes) */
  cellClassName?: string | ((row: TData) => string);
  /** Enable sorting for this column (default: true) */
  enableSorting?: boolean;
  /** Sort function type: 'auto' | 'alphanumeric' | 'basic' (default: 'auto') */
  sortingFn?: "auto" | "alphanumeric" | "basic";
}

export interface SortableTableProps<TData> {
  /** Array of data rows */
  data: readonly TData[];
  /** Column definitions */
  columns: readonly SortableTableColumn<TData>[];
  /** Optional CSS class for the wrapper */
  className?: string;
  /** Optional function to generate unique keys for rows */
  getRowKey?: (row: TData, index: number) => string;
  /** Optional ARIA label for the table */
  ariaLabel?: string;
  /** Optional initial sort state */
  initialSort?: { columnId: string; desc?: boolean };
}

function getSortIndicator(sortDirection: SortDirection | false): string | null {
  if (sortDirection === "asc") {
    return "▲";
  }
  if (sortDirection === "desc") {
    return "▼";
  }
  return null;
}

/**
 * Sortable table component using TanStack Table.
 * Supports single and multi-column sorting (Shift+click for multi-sort).
 * Sort state persists across re-renders.
 */
export function SortableTable<TData>({
  data,
  columns,
  className,
  getRowKey = (_, index): string => index.toString(),
  ariaLabel,
  initialSort,
}: SortableTableProps<TData>): React.ReactElement {
  // Convert our simplified column format to TanStack format
  const tableColumns = React.useMemo<ColumnDef<TData>[]>(
    () =>
      columns.map((col) => ({
        id: col.id,
        accessorFn: col.accessorFn,
        header: col.header,
        cell: (info): React.ReactNode => {
          const value = info.getValue();
          return col.cell != null ? col.cell(value, info.row.original) : (value as React.ReactNode);
        },
        enableSorting: col.enableSorting !== false,
        sortingFn: col.sortingFn ?? "auto",
        meta: {
          headerClassName: col.headerClassName,
          cellClassName: col.cellClassName,
        },
      })),
    [columns],
  );

  // Initialize sort state from initialSort prop
  const [sorting, setSorting] = React.useState<SortingState>(() => {
    if (initialSort != null) {
      return [{ id: initialSort.columnId, desc: initialSort.desc ?? false }];
    }
    return [];
  });

  const table = useReactTable({
    data: data as TData[],
    columns: tableColumns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableSortingRemoval: true,
    enableMultiSort: true,
  });

  return (
    <div className={classNames(styles.tableWrapper, className)}>
      <table className={styles.table} aria-label={ariaLabel}>
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as
                  | { headerClassName?: string; cellClassName?: string }
                  | undefined;
                const canSort = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();
                const sortIndicator = getSortIndicator(sortDirection);

                return (
                  <th
                    key={header.id}
                    className={classNames(meta?.headerClassName, {
                      [styles.sortableHeader]: canSort,
                      [styles.sortedAsc]: sortDirection === "asc",
                      [styles.sortedDesc]: sortDirection === "desc",
                    })}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    onKeyDown={
                      canSort
                        ? (e): void => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }
                        : undefined
                    }
                    tabIndex={canSort ? 0 : undefined}
                    role={canSort ? "button" : undefined}
                    aria-sort={
                      sortDirection === "asc"
                        ? "ascending"
                        : sortDirection === "desc"
                          ? "descending"
                          : canSort
                            ? "none"
                            : undefined
                    }
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {canSort && sortIndicator !== null && (
                      <span className={styles.sortIndicator} aria-hidden="true">
                        {sortIndicator}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, index) => (
            <tr key={getRowKey(row.original, index)}>
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as
                  | { headerClassName?: string; cellClassName?: string | ((row: TData) => string) }
                  | undefined;
                const cellClassName =
                  typeof meta?.cellClassName === "function" ? meta.cellClassName(row.original) : meta?.cellClassName;
                return (
                  <td key={cell.id} className={cellClassName}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
