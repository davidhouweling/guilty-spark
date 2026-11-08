import type { MockInstance } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aFakeIndividualTrackersRow } from "../../../services/database/fakes/database.fake";
import { installFakeServicesWith } from "../../../services/fakes/services";
import type { Services } from "../../../services/install";
import type { DatabaseService } from "../../../services/database/database";
import type { UserTokenProvider } from "../../../services/halo/user-token-provider";
import { resolveTrackerHaloService } from "../resolve-tracker-halo-service";

describe("resolveTrackerHaloService", () => {
  let services: Services;
  let getTracker: MockInstance<DatabaseService["getIndividualTracker"]>;
  let getClient: MockInstance<UserTokenProvider["getClientForUser"]>;

  beforeEach(() => {
    services = installFakeServicesWith();
    getTracker = vi.spyOn(services.databaseService, "getIndividualTracker");
    getClient = vi.spyOn(services.userTokenProvider, "getClientForUser");
  });

  it("uses the bot when the tracker is missing or inactive", async () => {
    getTracker.mockResolvedValueOnce(null).mockResolvedValueOnce(aFakeIndividualTrackersRow({ IsLive: 0 }));
    expect(await resolveTrackerHaloService(services, "missing", "context")).toBe(services.haloService);
    expect(await resolveTrackerHaloService(services, "inactive", "context")).toBe(services.haloService);
    expect(getClient).not.toHaveBeenCalled();
  });

  it("uses the bot when the live owner is signed out", async () => {
    getTracker.mockResolvedValue(aFakeIndividualTrackersRow({ UserId: "owner", IsLive: 1 }));
    getClient.mockResolvedValue(null);
    expect(await resolveTrackerHaloService(services, "tracker", "context")).toBe(services.haloService);
    expect(getClient).toHaveBeenCalledWith("owner");
  });

  it.each(["tracker", "credentials"])("logs %s lookup failure and falls back to bot", async (failure) => {
    const error = new Error("failed");
    getTracker.mockResolvedValue(aFakeIndividualTrackersRow({ UserId: "owner", IsLive: 1 }));
    if (failure === "tracker") {
      getTracker.mockRejectedValue(error);
    } else {
      getClient.mockRejectedValue(error);
    }
    const logError = vi.spyOn(services.logService, "error");
    expect(await resolveTrackerHaloService(services, "tracker", "context")).toBe(services.haloService);
    expect(logError).toHaveBeenCalledWith(
      error,
      new Map([
        ["context", "context"],
        ["trackerId", "tracker"],
      ]),
    );
  });
});
