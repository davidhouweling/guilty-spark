import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Dialog } from "../dialog";

afterEach(() => {
  cleanup();
});

describe("Dialog", () => {
  it("returns null when closed", () => {
    const onClose = vi.fn<() => void>();

    const { container } = render(
      <Dialog isOpen={false} onClose={onClose} title="Sample dialog">
        <div>Dialog body</div>
      </Dialog>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders title, body, and footer when open", () => {
    const onClose = vi.fn<() => void>();

    render(
      <Dialog isOpen={true} onClose={onClose} title="Sample dialog" footer={<button type="button">Save</button>}>
        <div>Dialog body</div>
      </Dialog>,
    );

    expect(screen.getByRole("heading", { name: "Sample dialog" })).toBeInTheDocument();
    expect(screen.getByText("Dialog body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("closes when clicking overlay and does not close when clicking dialog body", () => {
    const onClose = vi.fn<() => void>();

    render(
      <Dialog isOpen={true} onClose={onClose} title="Sample dialog">
        <div>Dialog body</div>
      </Dialog>,
    );

    fireEvent.click(screen.getByText("Dialog body"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables close button while busy", () => {
    const onClose = vi.fn<() => void>();

    render(
      <Dialog isOpen={true} onClose={onClose} title="Sample dialog" busy={true}>
        <div>Dialog body</div>
      </Dialog>,
    );

    expect(screen.getByRole("button", { name: "Close sample dialog" })).toBeDisabled();
  });
});
