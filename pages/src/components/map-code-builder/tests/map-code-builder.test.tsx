import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { createMapCodeBuilder } from "../create";

it("updates the plan from its dropdowns", () => {
  const MapCodeBuilderApp = createMapCodeBuilder();
  render(<MapCodeBuilderApp />);
  fireEvent.change(screen.getByLabelText("Select number of maps"), { target: { value: "7" } });
  fireEvent.change(screen.getByLabelText("Select a map format"), { target: { value: "O" } });
  expect(screen.getByLabelText("Generated map code").textContent.length).toBe(14);
  expect(screen.getByDisplayValue("Objective only")).toBeTruthy();
});
