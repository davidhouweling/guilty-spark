import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionResponse } from "@guilty-spark/shared/contracts/auth/session";
import { aFakeAuthServiceWith } from "../../../services/auth/fakes/auth.fake";
import { ProfileMenu } from "../profile-menu";

const { installAuthServiceMock } = vi.hoisted(() => ({ installAuthServiceMock: vi.fn() }));

vi.mock("../../../services/auth/install", () => ({
  installAuthService: installAuthServiceMock,
}));

function installWithSession(session: SessionResponse): ReturnType<typeof aFakeAuthServiceWith> {
  const authService = aFakeAuthServiceWith({ session });
  installAuthServiceMock.mockResolvedValue(authService);
  return authService;
}

describe("ProfileMenu", () => {
  let originalLocation: Location;

  beforeEach(() => {
    installAuthServiceMock.mockReset();
    originalLocation = window.location;
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: { href: "" } });
  });

  afterEach(() => {
    cleanup();
    Object.defineProperty(window, "location", { configurable: true, writable: true, value: originalLocation });
  });

  it("renders a sign-in link when unauthenticated", async () => {
    installWithSession({ authenticated: false });

    render(<ProfileMenu apiHost="https://api.example.com" />);

    const signIn = await screen.findByRole("link", { name: "Sign in" });
    expect(signIn).toHaveAttribute("href", "/login");
  });

  it("shows the avatar menu and signs out when authenticated", async () => {
    const authService = installWithSession({
      authenticated: true,
      userId: "user-123",
      expiresAt: 4102444800000,
      avatarUrl: "https://avatar.example/pic.png",
      xboxGamertag: "Spartan117",
    });
    const logoutSpy = vi.spyOn(authService, "logout");

    const user = userEvent.setup();
    render(<ProfileMenu apiHost="https://api.example.com" />);

    const trigger = await screen.findByRole("button", { name: "Profile menu" });
    await user.click(trigger);

    const signOut = await screen.findByRole("button", { name: "Sign out" });
    await user.click(signOut);

    await waitFor(() => {
      expect(logoutSpy).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(window.location.href).toBe("/login");
    });
  });
});
