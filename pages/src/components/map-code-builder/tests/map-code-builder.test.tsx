import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { createMapCodeBuilder } from "../create";
import { FakeDataTransfer, FakePointerEvent } from "../slot/fakes/drag-events.fake";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "elementFromPoint");
  Reflect.deleteProperty(HTMLElement.prototype, "setPointerCapture");
});

it("keeps saved selections and drafts attached to tiles through buttons and both drag paths", async () => {
  const user = userEvent.setup();
  const Builder = createMapCodeBuilder();
  render(<Builder />);
  const tiles = (): HTMLElement[] =>
    within(screen.getByRole("list", { name: "Map sequence" })).getAllByRole("listitem");
  const initial = tiles();
  const [first, second, third] = initial;
  const initialCode = screen.getByLabelText("Generated map code").textContent;
  expect(screen.getByRole("button", { name: "Move Match 1 up" }).hasAttribute("disabled")).toBe(true);
  expect(screen.getByRole("button", { name: "Move Match 5 down" }).hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Move Match 1 up" }));
  fireEvent.click(screen.getByRole("button", { name: "Move Match 5 down" }));
  expect(tiles()).toEqual(initial);
  screen.getByRole("button", { name: "Move Match 1 down" }).focus();
  await user.keyboard("{Enter}");
  expect(tiles()).toEqual([second, first, ...initial.slice(2)]);
  fireEvent.click(screen.getByRole("button", { name: "Move Match 2 up" }));
  expect(tiles()).toEqual(initial);
  expect(screen.getByLabelText("Generated map code").textContent).toBe(initialCode);

  const transfer = new FakeDataTransfer();
  fireEvent.dragStart(first, { dataTransfer: transfer });
  expect(transfer.getData("application/x-map-slot")).toBe(first.getAttribute("data-map-slot"));
  expect(fireEvent.dragOver(third, { dataTransfer: transfer })).toBe(false);
  fireEvent.drop(third, { dataTransfer: transfer });
  expect(tiles()).toEqual([second, third, first, ...initial.slice(3)]);
  expect(screen.getByLabelText("Generated map code").textContent).toBe(
    initialCode.slice(2, 6) + initialCode.slice(0, 2) + initialCode.slice(6),
  );

  vi.stubGlobal("PointerEvent", FakePointerEvent);
  const hitTest = vi.fn<(x: number, y: number) => Element | null>().mockReturnValue(second);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hitTest });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn<(id: number) => void>(),
  });
  const grip = within(first).getByRole("button", { name: "Drag Match 3 to reorder" });
  const pointer = { pointerId: 1, button: 0, clientX: 10, clientY: 10 };
  fireEvent.pointerDown(grip, pointer);
  fireEvent.pointerMove(grip, { ...pointer, clientX: 13 });
  fireEvent.pointerUp(grip, { ...pointer, clientX: 13 });
  expect(tiles()).toEqual([second, third, first, ...initial.slice(3)]);
  expect(hitTest).not.toHaveBeenCalled();
  fireEvent.pointerDown(grip, pointer);
  fireEvent.pointerMove(grip, { ...pointer, clientX: 40 });
  fireEvent.pointerCancel(grip, pointer);
  fireEvent.pointerUp(grip, { ...pointer, clientX: 40 });
  expect(tiles()).toEqual([second, third, first, ...initial.slice(3)]);
  expect(hitTest).not.toHaveBeenCalled();
  fireEvent.pointerDown(grip, pointer);
  fireEvent.pointerMove(grip, { ...pointer, clientX: 40 });
  fireEvent.pointerUp(grip, { ...pointer, clientX: 40 });
  expect(tiles()).toEqual(initial);
  expect(screen.getByLabelText("Generated map code").textContent).toBe(initialCode);

  fireEvent.click(within(first).getByRole("button", { name: "Edit Match 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Match 1 game type" }));
  fireEvent.click(screen.getByRole("button", { name: "Capture the Flag" }));
  fireEvent.click(screen.getByRole("button", { name: "Match 1 map" }));
  fireEvent.click(screen.getByRole("button", { name: "Origin" }));
  const savedSummary = within(first).getByRole("button", { name: "Match 1 map" });
  fireEvent.dragStart(second, { dataTransfer: transfer });
  fireEvent.drop(first, { dataTransfer: transfer });
  expect(tiles()).toEqual([second, first, ...initial.slice(2)]);
  expect(within(first).getByRole("button", { name: "Match 2 map" })).toBe(savedSummary);
  expect(savedSummary.textContent).toContain("Origin");
  fireEvent.click(within(first).getByRole("button", { name: "Save" }));
  expect(screen.getByLabelText("Generated map code").textContent).toBe(
    initialCode.slice(2, 4) + "CO" + initialCode.slice(4),
  );
});
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
