import { afterEach, describe, expect, it, vi } from "vitest";
import type { SessionResponse } from "@guilty-spark/shared/contracts/auth/session";
import { aFakeAuthServiceWith } from "../../../services/auth/fakes/auth.fake";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../../services/individual-tracker/fakes/settings.fake";
import type { LiveTrackersController } from "../live-trackers/types";
import { IndividualTrackerPresenter } from "../individual-tracker-presenter";
import { IndividualTrackerStore } from "../individual-tracker-store";

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function aFakeLiveTrackersController(): LiveTrackersController {
  return {
    start: vi.fn(),
    dispose: vi.fn(),
    setSessionContext: vi.fn(),
    resetForUnauthenticated: vi.fn(),
    refresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

const AUTHENTICATED_SESSION: SessionResponse = {
  authenticated: true,
  userId: "u1",
  expiresAt: 9999999999999,
  xboxGamertag: "ChiefSpartan",
  xboxXuid: "xuid-1",
};

const UNAUTHENTICATED_SESSION: SessionResponse = { authenticated: false };

interface Harness {
  store: IndividualTrackerStore;
  presenter: IndividualTrackerPresenter;
  liveTrackersController: LiveTrackersController;
}

function aHarness(session: SessionResponse = AUTHENTICATED_SESSION): Harness {
  const store = new IndividualTrackerStore();
  const liveTrackersController = aFakeLiveTrackersController();
  const authService = aFakeAuthServiceWith({ session });
  const settingsService = aFakeIndividualTrackerSettingsServiceWith({
    styleFlags: { matchmakingMyStatsOnly: true },
  });
  const presenter = new IndividualTrackerPresenter({
    authService,
    settingsService,
    store,
    liveTrackersController,
  });
  return { store, presenter, liveTrackersController };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IndividualTrackerPresenter", () => {
  describe("initial state", () => {
    it("starts with authState loading", () => {
      const { presenter } = aHarness();
      expect(presenter.getSnapshot().authState).toBe("loading");
    });
  });

  describe("load — authenticated", () => {
    it("sets authState to authenticated after successful load", async () => {
      const { presenter } = aHarness();
      presenter.start();
      await flushPromises();
      expect(presenter.getSnapshot().authState).toBe("authenticated");
    });

    it("calls setSessionContext with userId and gamertag", async () => {
      const { presenter, liveTrackersController } = aHarness();
      presenter.start();
      await flushPromises();
      expect(liveTrackersController.setSessionContext).toHaveBeenCalledWith("u1", "ChiefSpartan", "xuid-1");
    });

    it("populates gamertag from session", async () => {
      const { presenter } = aHarness();
      presenter.start();
      await flushPromises();
      expect(presenter.getSnapshot().gamertag).toBe("ChiefSpartan");
    });

    it("populates streamerSettings from settingsService", async () => {
      const { presenter } = aHarness();
      presenter.start();
      await flushPromises();
      expect(presenter.getSnapshot().streamerSettings).toMatchObject({
        styleFlags: { matchmakingMyStatsOnly: true },
      });
    });
  });

  describe("load — unauthenticated", () => {
    it("sets authState to unauthenticated when session is not authenticated", async () => {
      const { presenter } = aHarness(UNAUTHENTICATED_SESSION);
      presenter.start();
      await flushPromises();
      expect(presenter.getSnapshot().authState).toBe("unauthenticated");
    });

    it("calls resetForUnauthenticated on the controller", async () => {
      const { presenter, liveTrackersController } = aHarness(UNAUTHENTICATED_SESSION);
      presenter.start();
      await flushPromises();
      expect(liveTrackersController.resetForUnauthenticated).toHaveBeenCalled();
    });
  });

  describe("load — error", () => {
    it("sets authState to unauthenticated and sets errorMessage on session failure", async () => {
      const store = new IndividualTrackerStore();
      const liveTrackersController = aFakeLiveTrackersController();
      const authService = aFakeAuthServiceWith();
      vi.spyOn(authService, "getSession").mockRejectedValue(new Error("network error"));
      const settingsService = aFakeIndividualTrackerSettingsServiceWith();
      const presenter = new IndividualTrackerPresenter({
        authService,
        settingsService,
        store,
        liveTrackersController,
      });

      presenter.start();
      await flushPromises();

      expect(presenter.getSnapshot().authState).toBe("unauthenticated");
      expect(presenter.getSnapshot().errorMessage).not.toBeNull();
    });

    it("sets authState to authenticated with empty settings when getSettings fails", async () => {
      const store = new IndividualTrackerStore();
      const liveTrackersController = aFakeLiveTrackersController();
      const authService = aFakeAuthServiceWith({ session: AUTHENTICATED_SESSION });
      const settingsService = aFakeIndividualTrackerSettingsServiceWith();
      vi.spyOn(settingsService, "getSettings").mockRejectedValue(new Error("settings unavailable"));
      const presenter = new IndividualTrackerPresenter({
        authService,
        settingsService,
        store,
        liveTrackersController,
      });

      presenter.start();
      await flushPromises();

      expect(presenter.getSnapshot().authState).toBe("authenticated");
      expect(presenter.getSnapshot().streamerSettings).toEqual({});
      expect(liveTrackersController.setSessionContext).toHaveBeenCalledWith("u1", "ChiefSpartan", "xuid-1");
    });
  });

  describe("setActiveSection", () => {
    it("updates activeSection in the snapshot", async () => {
      const { presenter } = aHarness();
      presenter.start();
      await flushPromises();

      expect(presenter.getSnapshot().activeSection).toBe("live-trackers");
      presenter.setActiveSection("streamer-settings");
      expect(presenter.getSnapshot().activeSection).toBe("streamer-settings");
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("notifies subscriber on snapshot update", async () => {
      const { presenter } = aHarness();
      const listener = vi.fn();
      const unsubscribe = presenter.subscribe(listener);

      presenter.start();
      await flushPromises();

      expect(listener).toHaveBeenCalled();
      unsubscribe();
    });

    it("does not notify after unsubscribe", async () => {
      const { presenter } = aHarness();
      const listener = vi.fn();
      const unsubscribe = presenter.subscribe(listener);
      unsubscribe();

      presenter.start();
      await flushPromises();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("dispose", () => {
    it("does not update snapshot after dispose", async () => {
      const { presenter } = aHarness();
      presenter.start();
      presenter.dispose();
      await flushPromises();

      expect(presenter.getSnapshot().authState).toBe("loading");
    });
  });
});
