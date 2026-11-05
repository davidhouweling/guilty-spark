import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { createMapCodeBuilder } from "../create";
it("starts generated, edits all tiles, saves selections, and regenerates", async () => {
  const user = userEvent.setup();
  const Builder = createMapCodeBuilder();
  render(<Builder />);
  expect(screen.queryByLabelText("Select creation method")).toBeNull();
  expect(screen.getByRole("list", { name: "Map sequence" }).children).toHaveLength(5);
  expect(screen.getByLabelText("Generated map code").textContent.length).toBe(10);
  expect(screen.queryByRole("button", { name: "Match 1 game type" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Edit all" }));
  expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(5);
  fireEvent.click(screen.getByRole("button", { name: "Match 1 game type" }));
  fireEvent.click(screen.getByRole("button", { name: "Capture the Flag" }));
  fireEvent.click(screen.getByRole("button", { name: "Match 1 map" }));
  fireEvent.click(screen.getByRole("button", { name: "Origin" }));
  const first = screen.getAllByRole("listitem").at(0);
  if (first == null) {
    throw new Error("Missing first tile");
  }
  fireEvent.click(within(first).getByRole("button", { name: "Save" }));
  expect(within(first).getByText("Capture the Flag: Origin")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Edit Match 1" }));
  expect(screen.getByRole("button", { name: "Match 1 map" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  expect(screen.getByLabelText("Generated map code").textContent.length).toBe(10);
  await user.click(screen.getByRole("button", { name: "Edit all" }));
  const trigger = screen.getByRole("button", { name: "Match 1 game type" });
  const differentMode = trigger.textContent.includes("Strongholds") ? "Slayer" : "Strongholds";
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: differentMode }));
  expect(screen.getByRole("button", { name: "Match 1 game type" })).toBe(trigger);
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Match 1 map" }));
});
