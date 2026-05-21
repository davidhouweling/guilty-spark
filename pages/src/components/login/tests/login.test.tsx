import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Login } from "../login";

describe("Login", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders sign-in call to action", () => {
    render(<Login onSignIn={() => undefined} errorMessage={null} />);

    expect(screen.getByRole("heading", { name: "Sign In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue With Microsoft" })).toBeInTheDocument();
  });

  it("calls onSignIn when button is clicked", async () => {
    const user = userEvent.setup();
    const onSignIn = vi.fn<() => void>();

    render(<Login onSignIn={onSignIn} errorMessage={null} />);

    await user.click(screen.getByRole("button", { name: "Continue With Microsoft" }));

    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  it("renders error message when provided", () => {
    render(<Login onSignIn={() => undefined} errorMessage="Failed to start Microsoft sign-in" />);

    expect(screen.getByText("Failed to start Microsoft sign-in")).toBeInTheDocument();
  });
});
