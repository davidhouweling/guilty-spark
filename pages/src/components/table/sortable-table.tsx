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
  header: React.ReactNode;
  /** Function to extract cell value from row data */
  accessorFn: (row: TData) => unknown;
  /** Function to render cell content (optional, defaults to displaying the value) */
  cell?: (value: unknown, row: TData) => React.ReactNode;
  /** Optional CSS class for header cells */
  headerClassName?: string;
  /** Optional inline style for header cells */
  headerStyle?: React.CSSProperties;
  /** Optional CSS class for body cells (can be a function for dynamic classes) */
  cellClassName?: string | ((row: TData) => string);
  /** Optional inline style for body cells (can be a function for dynamic styles) */
  cellStyle?: React.CSSProperties | ((row: TData) => React.CSSProperties);
  /** Enable sorting for this column (default: true) */
  enableSorting?: boolean;
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
  /** Optional function to provide custom row styles */
  getRowStyle?: (row: TData) => React.CSSProperties | undefined;
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
  getRowStyle,
}: SortableTableProps<TData>): React.ReactElement {
  const columnsById = React.useMemo<ReadonlyMap<string, SortableTableColumn<TData>>>(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  // Convert our simplified column format to TanStack format
  const tableColumns = React.useMemo<ColumnDef<TData>[]>(
    () =>
      columns.map((col) => ({
        id: col.id,
        accessorFn: col.accessorFn,
        header: (): React.ReactNode => col.header,
        cell: (info): React.ReactNode => {
          const value = info.getValue();
          return col.cell != null ? col.cell(value, info.row.original) : (value as React.ReactNode);
        },
        enableSorting: col.enableSorting !== false,
        sortingFn: col.sortingFn ?? "auto",
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
                const column = columnsById.get(header.column.id);
                const canSort = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();
                const sortIndicator = getSortIndicator(sortDirection);

                return (
                  <th
                    key={header.id}
                    style={column?.headerStyle}
                    className={classNames(column?.headerClassName, {
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
          {table.getRowModel().rows.map((row, index) => {
            const rowStyle = getRowStyle?.(row.original);
            return (
              <tr key={getRowKey(row.original, index)} style={rowStyle}>
                {row.getVisibleCells().map((cell) => {
                  const column = columnsById.get(cell.column.id);
                  const cellClassName =
                    typeof column?.cellClassName === "function"
                      ? column.cellClassName(row.original)
                      : column?.cellClassName;
                  const cellStyle =
                    typeof column?.cellStyle === "function" ? column.cellStyle(row.original) : column?.cellStyle;
                  return (
                    <td key={cell.id} className={cellClassName} style={cellStyle}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
