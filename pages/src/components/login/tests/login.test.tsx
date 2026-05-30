import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Login } from "../login";

describe("Login", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the sign-in call to action linking to the provided URL", () => {
    render(<Login signInHref="https://api.example.com/auth/microsoft/start?redirect=%2F" />);

    expect(screen.getByRole("heading", { name: "Sign In" })).toBeInTheDocument();
    const signIn = screen.getByRole("link", { name: "Continue With Microsoft" });
    expect(signIn).toHaveAttribute("href", "https://api.example.com/auth/microsoft/start?redirect=%2F");
  });
});
