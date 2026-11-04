import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMapCodeBuilder } from "../create";

describe("MapCodeBuilder", () => {
  it("generates best-of codes from visual controls", async () => {
    const user = userEvent.setup();
    const MapCodeBuilderApp = createMapCodeBuilder();
    render(<MapCodeBuilderApp />);

    expect(screen.getByText(/\/maps code:/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Select number of maps"), "7");
    expect(screen.getByLabelText("Generated map code").textContent).toHaveLength(14);
    await user.selectOptions(screen.getByLabelText("Select a playlist"), "historical");

    await user.selectOptions(screen.getByLabelText("Select a map format"), "O");
    expect(screen.getByLabelText("Select a map format")).toHaveValue("O");
  });
});
