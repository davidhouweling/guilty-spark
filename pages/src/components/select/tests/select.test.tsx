import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "../select";

describe("Select", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a native select with a decorative chevron", () => {
    const { container } = render(
      <Select aria-label="Test select" value="one" onChange={(): void => undefined}>
        <option value="one">One</option>
        <option value="two">Two</option>
      </Select>,
    );

    expect(screen.getByRole("combobox", { name: "Test select" })).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("forwards change events", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<React.ChangeEventHandler<HTMLSelectElement>>();

    render(
      <Select aria-label="Test select" defaultValue="one" onChange={onChange}>
        <option value="one">One</option>
        <option value="two">Two</option>
      </Select>,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Test select" }), "two");

    expect(onChange).toHaveBeenCalled();
  });
});