import "@testing-library/jest-dom/vitest";

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SortableTable, type SortableTableColumn } from "../sortable-table";

afterEach(() => {
  cleanup();
});

interface TestRow {
  id: number;
  name: string;
  score: number;
  active: boolean;
}

describe("SortableTable", () => {
  const testData: TestRow[] = [
    { id: 1, name: "Alice", score: 100, active: true },
    { id: 2, name: "Bob", score: 85, active: false },
    { id: 3, name: "Charlie", score: 92, active: true },
  ];

  const columns: SortableTableColumn<TestRow>[] = [
    {
      id: "name",
      header: "Name",
      accessorFn: (row) => row.name,
      sortingFn: "alphanumeric",
    },
    {
      id: "score",
      header: "Score",
      accessorFn: (row) => row.score,
      sortingFn: "basic",
    },
    {
      id: "active",
      header: "Active",
      accessorFn: (row) => row.active,
      cell: (value: unknown) => (value === true ? "Yes" : "No"),
      sortingFn: "basic",
    },
  ];

  it("renders table with headers and data", () => {
    render(<SortableTable data={testData} columns={columns} ariaLabel="Test table" />);

    expect(screen.getByLabelText("Test table")).toBeInTheDocument();
    expect(screen.getAllByText("Name")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Score")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Active")[0]).toBeInTheDocument();

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("renders custom cell content when cell function is provided", () => {
    render(<SortableTable data={testData} columns={columns} ariaLabel="Test table" />);

    const yesElements = screen.getAllByText("Yes");
    expect(yesElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("No")[0]).toBeInTheDocument();
  });

  it("sorts data when clicking on sortable header", async () => {
    const user = userEvent.setup();

    render(<SortableTable data={testData} columns={columns} ariaLabel="Test table" />);

    const scoreHeaders = screen.getAllByText("Score");
    const [scoreHeader] = scoreHeaders;
    const headerCell = scoreHeader.closest("th");
    expect(headerCell).toHaveAttribute("role", "button");

    const initialSort = headerCell?.getAttribute("aria-sort");
    await user.click(scoreHeader);

    const newSort = headerCell?.getAttribute("aria-sort");
    expect(newSort).not.toBe(initialSort);
    expect(newSort).toMatch(/ascending|descending/);
  });

  it("toggles sort direction on repeated clicks", async () => {
    const user = userEvent.setup();

    render(<SortableTable data={testData} columns={columns} ariaLabel="Test table" />);

    const scoreHeaders = screen.getAllByText("Score");
    const [scoreHeader] = scoreHeaders;

    await user.click(scoreHeader);
    let rows = screen.getAllByRole("row").slice(1);
    let [firstRow] = rows;
    let firstRowCells = within(firstRow).getAllByRole("cell");
    const firstClickScore = parseInt(firstRowCells[1]?.textContent || "0", 10);

    await user.click(scoreHeader);
    rows = screen.getAllByRole("row").slice(1);
    [firstRow] = rows;
    firstRowCells = within(firstRow).getAllByRole("cell");
    const secondClickScore = parseInt(firstRowCells[1]?.textContent || "0", 10);

    expect(firstClickScore).not.toBe(secondClickScore);
  });

  it("displays sort indicator for sorted column", async () => {
    const user = userEvent.setup();

    render(<SortableTable data={testData} columns={columns} ariaLabel="Test table" />);

    const scoreHeaders = screen.getAllByText("Score");
    const [scoreHeader] = scoreHeaders;
    await user.click(scoreHeader);

    const headerCell = scoreHeader.closest("th");
    const headerText = headerCell?.textContent;
    expect(headerText).toMatch(/▲|▼/);
  });

  it("applies initial sort when provided", () => {
    render(
      <SortableTable
        data={testData}
        columns={columns}
        ariaLabel="Test table"
        initialSort={{ columnId: "score", desc: true }}
      />,
    );

    const rows = screen.getAllByRole("row").slice(1);
    const firstRowCells = within(rows[0]).getAllByRole("cell");
    expect(firstRowCells[1]).toHaveTextContent("100");
  });

  it("supports keyboard navigation on sortable headers", async () => {
    const user = userEvent.setup();

    render(<SortableTable data={testData} columns={columns} ariaLabel="Test table" />);

    const scoreHeaders = screen.getAllByText("Score");
    const [scoreHeader] = scoreHeaders;
    const headerCell = scoreHeader.closest("th");

    const initialSort = headerCell?.getAttribute("aria-sort");
    scoreHeader.focus();

    await user.keyboard("{Enter}");

    const newSort = headerCell?.getAttribute("aria-sort");
    expect(newSort).not.toBe(initialSort);
  });

  it("applies custom header and cell class names", () => {
    const columnsWithClasses: SortableTableColumn<TestRow>[] = [
      {
        id: "name",
        header: "Name",
        accessorFn: (row) => row.name,
        headerClassName: "custom-header",
        cellClassName: "custom-cell",
      },
    ];

    render(<SortableTable data={testData} columns={columnsWithClasses} ariaLabel="Test table" />);

    const nameHeaders = screen.getAllByText("Name");
    const headerCell = nameHeaders[0].closest("th");
    expect(headerCell).toHaveClass("custom-header");

    const cells = screen.getAllByRole("cell");
    cells.forEach((cell) => {
      expect(cell).toHaveClass("custom-cell");
    });
  });

  it("applies dynamic cell class names based on row data", () => {
    const columnsWithDynamicClass: SortableTableColumn<TestRow>[] = [
      {
        id: "name",
        header: "Name",
        accessorFn: (row) => row.name,
        cellClassName: (row) => (row.active ? "active-cell" : "inactive-cell"),
      },
    ];

    render(<SortableTable data={testData} columns={columnsWithDynamicClass} ariaLabel="Test table" />);

    const cells = screen.getAllByRole("cell");
    const aliceCell = cells.find((cell) => cell.textContent === "Alice");
    const bobCell = cells.find((cell) => cell.textContent === "Bob");

    expect(aliceCell).toHaveClass("active-cell");
    expect(bobCell).toHaveClass("inactive-cell");
  });

  it("uses custom getRowKey function when provided", () => {
    const { container } = render(
      <SortableTable
        data={testData}
        columns={columns}
        ariaLabel="Test table"
        getRowKey={(row) => `row-${row.id.toString()}`}
      />,
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0]).toBeTruthy();
  });

  it("applies custom row styles when getRowStyle is provided", () => {
    const { container } = render(
      <SortableTable
        data={testData}
        columns={columns}
        ariaLabel="Test table"
        getRowStyle={(row) => ({ backgroundColor: row.active ? "green" : "red" })}
      />,
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows[0]).toHaveAttribute("style");
  });

  it("handles empty data array", () => {
    render(<SortableTable data={[]} columns={columns} ariaLabel="Empty table" />);

    expect(screen.getByLabelText("Empty table")).toBeInTheDocument();
    expect(screen.getAllByText("Name")[0]).toBeInTheDocument();

    const bodyRows = screen.queryAllByRole("row");
    expect(bodyRows.length).toBeGreaterThanOrEqual(1);
  });

  it("disables sorting for columns with enableSorting false", () => {
    const columnsWithNonSortable: SortableTableColumn<TestRow>[] = [
      {
        id: "name",
        header: "Name",
        accessorFn: (row) => row.name,
        enableSorting: false,
      },
    ];

    render(<SortableTable data={testData} columns={columnsWithNonSortable} ariaLabel="Test table" />);

    const nameHeaders = screen.getAllByText("Name");
    const headerCell = nameHeaders[0].closest("th");
    expect(headerCell).not.toHaveAttribute("role", "button");
  });

  it("sets appropriate ARIA attributes for sorted columns", async () => {
    const user = userEvent.setup();

    render(<SortableTable data={testData} columns={columns} ariaLabel="Test table" />);

    const scoreHeaders = screen.getAllByText("Score");
    const [scoreHeader] = scoreHeaders;
    const headerCell = scoreHeader.closest("th");

    expect(headerCell).toHaveAttribute("aria-sort", "none");

    await user.click(scoreHeader);
    const firstSort = headerCell?.getAttribute("aria-sort");
    expect(firstSort).toMatch(/ascending|descending/);

    await user.click(scoreHeader);
    const secondSort = headerCell?.getAttribute("aria-sort");
    expect(secondSort).toMatch(/ascending|descending/);
    expect(secondSort).not.toBe(firstSort);
  });
});
