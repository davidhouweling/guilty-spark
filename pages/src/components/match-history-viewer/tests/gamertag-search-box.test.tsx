import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GamertagSearchBox } from "../gamertag-search-box";

describe("GamertagSearchBox", () => {
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: { assign: vi.fn() } });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
  });

  it("pre-fills the input with the initial gamertag", () => {
    render(<GamertagSearchBox initialGamertag="Master Chief" />);

    expect(screen.getByLabelText("Gamertag")).toHaveValue("Master Chief");
  });

  it("disables the search button when the input is empty", () => {
    render(<GamertagSearchBox initialGamertag="" />);

    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });

  it("navigates to the encoded gamertag's match history page on submit", async () => {
    const assignSpy = vi.fn();
    window.location.assign = assignSpy;
    const user = userEvent.setup();
    render(<GamertagSearchBox initialGamertag="" />);

    await user.type(screen.getByLabelText("Gamertag"), "Fake Spartan #123");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith("/matches/Fake%20Spartan%20%23123");
    });
  });
});
