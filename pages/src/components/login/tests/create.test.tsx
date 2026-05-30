import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "../create";
import type { AuthService } from "../../../services/auth/types";
import { aFakeAuthServiceWith } from "../../../services/auth/fakes/auth.fake";

describe("LoginPage", () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = aFakeAuthServiceWith();
    window.history.pushState({}, "", "/login");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders sign-in card when unauthenticated", async () => {
    vi.spyOn(authService, "getSession").mockResolvedValue({ authenticated: false });

    render(<LoginPage authService={authService} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue With Microsoft" })).toBeInTheDocument();
    });
  });

  it("passes redirect path to microsoft auth when sign-in is clicked", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/login?redirect=%2Findividual-tracker");

    vi.spyOn(authService, "getSession").mockResolvedValue({ authenticated: false });
    const startMicrosoftAuthSpy = vi
      .spyOn(authService, "startMicrosoftAuth")
      .mockRejectedValue(new Error("Sign-in start failed"));

    render(<LoginPage authService={authService} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue With Microsoft" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Continue With Microsoft" }));

    await waitFor(() => {
      const [firstRedirect] = startMicrosoftAuthSpy.mock.calls[0] ?? [];
      expect(firstRedirect).toBe("/individual-tracker");
      expect(screen.getByText("Sign-in start failed")).toBeInTheDocument();
    });
  });

  it.each([
    ["backslash", "%2F%5Cevil.com"], // "/\evil.com"
    ["dot-double-slash", "%2F..%2F%2Fevil.com"], // "/..//evil.com" -> resolves to pathname "//evil.com"
    ["self-referential login", "%2Flogin"], // "/login" -> would loop back to the login page
    ["self-referential login with query", "%2Flogin%3Fredirect%3D%2Flogin"], // "/login?redirect=/login"
  ])("rejects the %s redirect target and falls back to root", async (_label, encodedRedirect) => {
    const user = userEvent.setup();
    window.history.pushState({}, "", `/login?redirect=${encodedRedirect}`);

    vi.spyOn(authService, "getSession").mockResolvedValue({ authenticated: false });
    const startMicrosoftAuthSpy = vi
      .spyOn(authService, "startMicrosoftAuth")
      .mockRejectedValue(new Error("Sign-in start failed"));

    render(<LoginPage authService={authService} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue With Microsoft" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Continue With Microsoft" }));

    await waitFor(() => {
      const [firstRedirect] = startMicrosoftAuthSpy.mock.calls[0] ?? [];
      expect(firstRedirect).toBe("/");
    });
  });

  it("uses root redirect when login page has no redirect query", async () => {
    const user = userEvent.setup();

    vi.spyOn(authService, "getSession").mockResolvedValue({ authenticated: false });
    const startMicrosoftAuthSpy = vi
      .spyOn(authService, "startMicrosoftAuth")
      .mockRejectedValue(new Error("Sign-in start failed"));

    render(<LoginPage authService={authService} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue With Microsoft" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Continue With Microsoft" }));

    await waitFor(() => {
      const [firstRedirect] = startMicrosoftAuthSpy.mock.calls[0] ?? [];
      expect(firstRedirect).toBe("/");
    });
  });

  it("shows error state and can retry session check", async () => {
    const user = userEvent.setup();
    const getSessionSpy = vi
      .spyOn(authService, "getSession")
      .mockRejectedValueOnce(new Error("Session unavailable"))
      .mockResolvedValueOnce({ authenticated: false });

    render(<LoginPage authService={authService} />);

    await waitFor(() => {
      expect(screen.getByText("Session unavailable")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Retry Connection" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue With Microsoft" })).toBeInTheDocument();
      expect(getSessionSpy).toHaveBeenCalledTimes(2);
    });
  });
});
