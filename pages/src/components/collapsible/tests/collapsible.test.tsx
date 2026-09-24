import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Collapsible } from "../collapsible";

describe("Collapsible", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render children by default", () => {
    render(
      <Collapsible title="Advanced">
        <p>Hidden content</p>
      </Collapsible>,
    );

    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-expanded", "false");
  });

  it("renders children when defaultOpen is true", () => {
    render(
      <Collapsible title="Advanced" defaultOpen>
        <p>Hidden content</p>
      </Collapsible>,
    );

    expect(screen.getByText("Hidden content")).toBeInTheDocument();
  });

  it("toggles the content when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Collapsible title="Advanced">
        <p>Hidden content</p>
      </Collapsible>,
    );

    const trigger = screen.getByRole("button", { name: "Advanced" });
    await user.click(trigger);

    expect(screen.getByText("Hidden content")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(trigger);

    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
