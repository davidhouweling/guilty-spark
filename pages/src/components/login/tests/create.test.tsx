import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Services } from "../../../services/types";
import { installFakeServices } from "../../../services/install.fake";
import { LoginPageFactory } from "../create";

async function createServices(): Promise<Services> {
  return installFakeServices();
}

describe("LoginPage", () => {
  let services: Services;

  beforeEach(async () => {
    services = await createServices();
    window.history.pushState({}, "", "/login");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders sign-in card when unauthenticated", async () => {
    const { authService } = services;
    vi.spyOn(authService, "getSession").mockResolvedValue({ authenticated: false });

    render(<LoginPageFactory services={services} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue With Microsoft" })).toBeInTheDocument();
    });
  });

  it("passes redirect path to microsoft auth when sign-in is clicked", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/login?redirect=%2Findividual-tracker");
    const { authService } = services;

    vi.spyOn(authService, "getSession").mockResolvedValue({ authenticated: false });
    const startMicrosoftAuthSpy = vi
      .spyOn(authService, "startMicrosoftAuth")
      .mockRejectedValue(new Error("Sign-in start failed"));

    render(<LoginPageFactory services={services} />);

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

  it("uses root redirect when login page has no redirect query", async () => {
    const user = userEvent.setup();
    const { authService } = services;

    vi.spyOn(authService, "getSession").mockResolvedValue({ authenticated: false });
    const startMicrosoftAuthSpy = vi
      .spyOn(authService, "startMicrosoftAuth")
      .mockRejectedValue(new Error("Sign-in start failed"));

    render(<LoginPageFactory services={services} />);

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
    const { authService } = services;
    const getSessionSpy = vi
      .spyOn(authService, "getSession")
      .mockRejectedValueOnce(new Error("Session unavailable"))
      .mockResolvedValueOnce({ authenticated: false });

    render(<LoginPageFactory services={services} />);

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
