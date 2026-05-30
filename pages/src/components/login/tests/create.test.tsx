import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginPage } from "../create";
import type { AuthService } from "../../../services/auth/types";
import { aFakeAuthServiceWith } from "../../../services/auth/fakes/auth.fake";

const API_HOST = "https://api.example.com";

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

  it("renders a sign-in card linking to the API start endpoint when unauthenticated", async () => {
    vi.spyOn(authService, "getSession").mockResolvedValue({ authenticated: false });

    render(<LoginPage authService={authService} apiHost={API_HOST} />);

    const signIn = await screen.findByRole("link", { name: "Continue With Microsoft" });
    const url = new URL(signIn.getAttribute("href") ?? "");
    expect(`${url.origin}${url.pathname}`).toBe(`${API_HOST}/auth/microsoft/start`);
  });

  it.each([
    ["valid path", "?redirect=%2Findividual-tracker", "/individual-tracker"],
    ["backslash", "?redirect=%2F%5Cevil.com", "/"],
    ["dot-double-slash", "?redirect=%2F..%2F%2Fevil.com", "/"],
    ["self-referential login", "?redirect=%2Flogin", "/"],
    ["self-referential login with query", "?redirect=%2Flogin%3Fredirect%3D%2Flogin", "/"],
    ["no redirect query", "", "/"],
  ])("builds the sign-in URL with a safe redirect for %s", async (_label, query, expectedRedirect) => {
    window.history.pushState({}, "", `/login${query}`);
    vi.spyOn(authService, "getSession").mockResolvedValue({ authenticated: false });

    render(<LoginPage authService={authService} apiHost={API_HOST} />);

    const signIn = await screen.findByRole("link", { name: "Continue With Microsoft" });
    const url = new URL(signIn.getAttribute("href") ?? "");
    expect(url.searchParams.get("redirect")).toBe(expectedRedirect);
  });

  it("shows error state and can retry session check", async () => {
    const user = userEvent.setup();
    const getSessionSpy = vi
      .spyOn(authService, "getSession")
      .mockRejectedValueOnce(new Error("Session unavailable"))
      .mockResolvedValueOnce({ authenticated: false });

    render(<LoginPage authService={authService} apiHost={API_HOST} />);

    await waitFor(() => {
      expect(screen.getByText("Session unavailable")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Retry Connection" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Continue With Microsoft" })).toBeInTheDocument();
      expect(getSessionSpy).toHaveBeenCalledTimes(2);
    });
  });
});
