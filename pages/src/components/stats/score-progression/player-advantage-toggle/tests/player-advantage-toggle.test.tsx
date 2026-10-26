import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerAdvantageToggle } from "../player-advantage-toggle";

afterEach(() => {
  cleanup();
});

describe("PlayerAdvantageToggle", () => {
  it("labels the checkbox with the overlay's series name and reflects the checked state", () => {
    render(<PlayerAdvantageToggle checked onChange={vi.fn<(checked: boolean) => void>()} />);

    expect(screen.getByLabelText("Player Advantage")).toBeChecked();
  });

  it("reports the flipped state on click", async () => {
    const onChange = vi.fn<(checked: boolean) => void>();
    render(<PlayerAdvantageToggle checked={false} onChange={onChange} />);

    await userEvent.click(screen.getByLabelText("Player Advantage"));

    expect(onChange).toHaveBeenCalledWith(true);
  });
});
