import type { MockInstance } from "vitest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { XstsTokenProvider } from "../xsts-token-provider.mjs";
import type { XboxService } from "../../xbox/xbox.mjs";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake.mjs";

vi.mock("halo-infinite-api", () => ({
  StaticXstsTicketTokenSpartanTokenProvider: class StaticXstsTicketTokenSpartanTokenProvider {
    constructor(readonly token: string) {}

    getSpartanToken(): string {
      return this.token;
    }
  },
}));

describe("XstsTokenProvider", () => {
  let xboxService: XboxService;
  let xstsTokenProvider: XstsTokenProvider;
  let getTokenSpy: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    xboxService = aFakeXboxServiceWith();
    getTokenSpy = vi.spyOn(xboxService, "token", "get").mockReturnValue("fake-xsts-token");

    xstsTokenProvider = new XstsTokenProvider(xboxService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getSpartanToken()", () => {
    it("calls xboxService.maybeRefreshToken()", async () => {
      const maybeRefreshTokenSpy = vi.spyOn(xboxService, "maybeRefreshToken");

      await xstsTokenProvider.getSpartanToken();

      expect(maybeRefreshTokenSpy).toHaveBeenCalled();
    });

    it("uses the token from xboxService", async () => {
      await xstsTokenProvider.getSpartanToken();

      expect(getTokenSpy).toHaveBeenCalled();
    });

    it("returns a spartan token", async () => {
      const token = await xstsTokenProvider.getSpartanToken();

      expect(token).toEqual("fake-xsts-token");
    });
  });

  describe("clearSpartanToken()", () => {
    it("clears the token from xboxService", async () => {
      const clearTokenSpy = vi.spyOn(xboxService, "clearToken");

      await xstsTokenProvider.clearSpartanToken();

      expect(clearTokenSpy).toHaveBeenCalled();
    });
  });
});
