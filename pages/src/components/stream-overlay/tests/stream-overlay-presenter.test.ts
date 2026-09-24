import { describe, expect, it } from "vitest";
import { aFakeAuthServiceWith } from "../../../services/auth/fakes/auth.fake";
import { StreamOverlayPresenter, STREAM_OVERLAY_DEMO_GAMERTAG } from "../stream-overlay-presenter";
import { StreamOverlayStore } from "../stream-overlay-store";

describe("StreamOverlayPresenter", () => {
  it("starts in the loading auth state", () => {
    const store = new StreamOverlayStore();
    const presenter = new StreamOverlayPresenter({ authService: aFakeAuthServiceWith(), store });

    expect(presenter.getSnapshot().authState).toBe("loading");
  });

  it("loads the authenticated session's gamertag and avatar", async () => {
    const store = new StreamOverlayStore();
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
    const presenter = new StreamOverlayPresenter({ authService, store });

    presenter.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(presenter.getSnapshot()).toEqual({
      authState: "authenticated",
      gamertag: "TestSpartan",
      avatarUrl: "https://example.com/avatar.png",
    });
  });

  it("falls back to demo data when unauthenticated", async () => {
    const store = new StreamOverlayStore();
    const authService = aFakeAuthServiceWith({ session: { authenticated: false } });
    const presenter = new StreamOverlayPresenter({ authService, store });

    presenter.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(presenter.getSnapshot()).toEqual({
      authState: "unauthenticated",
      gamertag: STREAM_OVERLAY_DEMO_GAMERTAG,
      avatarUrl: null,
    });
  });

  it("falls back to demo data when the session request fails", async () => {
    const store = new StreamOverlayStore();
    const authService = aFakeAuthServiceWith();
    authService.getSession = async (): Promise<never> => Promise.reject(new Error("network failure"));
    const presenter = new StreamOverlayPresenter({ authService, store });

    presenter.start();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(presenter.getSnapshot()).toEqual({
      authState: "unauthenticated",
      gamertag: STREAM_OVERLAY_DEMO_GAMERTAG,
      avatarUrl: null,
    });
  });

  it("notifies subscribers when the snapshot changes", async () => {
    const store = new StreamOverlayStore();
    const authService = aFakeAuthServiceWith({ session: { authenticated: false } });
    const presenter = new StreamOverlayPresenter({ authService, store });
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
    const store = new StreamOverlayStore();
    const authService = aFakeAuthServiceWith({ session: { authenticated: false } });
    const presenter = new StreamOverlayPresenter({ authService, store });

    presenter.start();
    presenter.dispose();
    await Promise.resolve();
    await Promise.resolve();

    expect(presenter.getSnapshot().authState).toBe("loading");
  });
});
