import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CopyUrlField } from "../copy-url-field";

describe("CopyUrlField", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the URL with an attached labelled copy button", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn<() => void>();

    render(
      <CopyUrlField
        displayText="https://example.com/u/Spartan"
        copyLabel="Copy viewer URL"
        copied={false}
        disabled={false}
        onCopy={onCopy}
      />,
    );

    expect(screen.getByText("https://example.com/u/Spartan")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy viewer URL" }));
    expect(onCopy).toHaveBeenCalledOnce();
  });

  it("disables the copy button when disabled", () => {
    render(
      <CopyUrlField displayText="Example" copyLabel="Copy overlay URL" copied={false} disabled onCopy={vi.fn()} />,
    );

    expect(screen.getByRole("button", { name: "Copy overlay URL" })).toBeDisabled();
  });
});
