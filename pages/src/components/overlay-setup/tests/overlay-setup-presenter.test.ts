import { describe, expect, it } from "vitest";
import { aFakeAuthServiceWith } from "../../../services/auth/fakes/auth.fake";
import { OverlaySetupPresenter, OVERLAY_SETUP_DEMO_GAMERTAG } from "../overlay-setup-presenter";
import { OverlaySetupStore } from "../overlay-setup-store";

describe("OverlaySetupPresenter", () => {
  it("starts in the loading auth state", () => {
    const store = new OverlaySetupStore();
    const presenter = new OverlaySetupPresenter({ authService: aFakeAuthServiceWith(), store });

    expect(presenter.getSnapshot().authState).toBe("loading");
  });

  it("loads the authenticated session's gamertag and avatar", async () => {
    const store = new OverlaySetupStore();
    const authService = aFakeAuthServiceWith({
      session: {
        authenticated: true,
        userId: "user-1",
        expiresAt: 4102444800000,
        avatarUrl: "https://example.com/avatar.png",
        xboxGamertag: "TestSpartan",
        xboxXuid: "123",
      },
    });
    const presenter = new OverlaySetupPresenter({ authService, store });

    presenter.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(presenter.getSnapshot()).toEqual({
      authState: "authenticated",
      gamertag: "TestSpartan",
      avatarUrl: "https://example.com/avatar.png",
      errorMessage: null,
    });
  });

  it("falls back to demo data when unauthenticated", async () => {
    const store = new OverlaySetupStore();
    const authService = aFakeAuthServiceWith({ session: { authenticated: false } });
    const presenter = new OverlaySetupPresenter({ authService, store });

    presenter.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(presenter.getSnapshot()).toEqual({
      authState: "unauthenticated",
      gamertag: OVERLAY_SETUP_DEMO_GAMERTAG,
      avatarUrl: null,
      errorMessage: null,
    });
  });

  it("preserves the session failure instead of falling back to demo data", async () => {
    const store = new OverlaySetupStore();
    const authService = aFakeAuthServiceWith();
    authService.getSession = async (): Promise<never> => Promise.reject(new Error("network failure"));
    const presenter = new OverlaySetupPresenter({ authService, store });

    presenter.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(presenter.getSnapshot()).toEqual({
      authState: "error",
      gamertag: null,
      avatarUrl: null,
      errorMessage: "Failed to load session. Please refresh the page.",
    });
  });

  it("resets to loading before retrying after a session error", async () => {
    const store = new OverlaySetupStore();
    const authService = aFakeAuthServiceWith();
    authService.getSession = async (): Promise<never> => Promise.reject(new Error("network failure"));
    const presenter = new OverlaySetupPresenter({ authService, store });

    presenter.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(presenter.getSnapshot().authState).toBe("error");

    authService.getSession = async (): Promise<never> => new Promise(() => undefined);
    presenter.start();

    expect(presenter.getSnapshot().authState).toBe("loading");
  });

  it("notifies subscribers when the snapshot changes", async () => {
    const store = new OverlaySetupStore();
    const authService = aFakeAuthServiceWith({ session: { authenticated: false } });
    const presenter = new OverlaySetupPresenter({ authService, store });
    let notified = false;
    const unsubscribe = presenter.subscribe(() => {
      notified = true;
    });

    presenter.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(notified).toBe(true);
    unsubscribe();
  });

  it("ignores a stale load after dispose", async () => {
    const store = new OverlaySetupStore();
    const authService = aFakeAuthServiceWith({ session: { authenticated: false } });
    const presenter = new OverlaySetupPresenter({ authService, store });

    presenter.start();
    presenter.dispose();
    await Promise.resolve();
    await Promise.resolve();

    expect(presenter.getSnapshot().authState).toBe("loading");
  });
});
