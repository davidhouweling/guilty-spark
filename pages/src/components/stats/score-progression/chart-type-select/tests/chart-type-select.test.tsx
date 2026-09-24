import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartTypeSelect } from "../chart-type-select";

afterEach(() => {
  cleanup();
});

const OPTIONS = [
  { value: "timeline", label: "Objective Timeline" },
  { value: "progression", label: "Score Progression" },
] as const;

describe("ChartTypeSelect", () => {
  it("renders one option per chart type with the current value selected", () => {
    render(<ChartTypeSelect value="timeline" options={OPTIONS} onChange={vi.fn<(value: string) => void>()} />);
    const select = screen.getByLabelText("Chart type");
    expect(select).toHaveValue("timeline");
    expect(screen.getByText("Objective Timeline")).toBeInTheDocument();
    expect(screen.getByText("Score Progression")).toBeInTheDocument();
  });

  it("fires onChange with the selected chart type", async () => {
    const onChange = vi.fn<(value: string) => void>();
    render(<ChartTypeSelect value="timeline" options={OPTIONS} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText("Chart type"), "progression");
    expect(onChange).toHaveBeenCalledWith("progression");
  });
});
