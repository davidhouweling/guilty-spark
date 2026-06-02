import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dialog } from "../dialog";

afterEach(() => {
  cleanup();
});

describe("Dialog", () => {
  it("renders nothing when closed", () => {
    render(
      <Dialog open={false} title="Add tracker" onClose={() => undefined}>
        <p>Body content</p>
      </Dialog>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Body content")).not.toBeInTheDocument();
  });

  it("renders an accessible dialog labelled by its title when open", () => {
    render(
      <Dialog open title="Add tracker" onClose={() => undefined}>
        <p>Body content</p>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Add tracker");
    expect(screen.getByText("Body content")).toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Dialog open title="Add tracker" onClose={onClose}>
        <p>Body content</p>
      </Dialog>,
    );

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the overlay is clicked", async () => {
    expect.assertions(2);
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Dialog open title="Add tracker" onClose={onClose}>
        <p>Body content</p>
      </Dialog>,
    );

    const overlay = screen.getByRole("dialog").parentElement;
    expect(overlay).not.toBeNull();
    if (overlay !== null) {
      await user.click(overlay);
    }

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when content inside the panel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Dialog open title="Add tracker" onClose={onClose}>
        <p>Body content</p>
      </Dialog>,
    );

    await user.click(screen.getByText("Body content"));

    expect(onClose).not.toHaveBeenCalled();
  });
});
