import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DateTime } from "luxon";
import { CustomSpartanTokenProvider } from "../custom-spartan-token-provider.mjs";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { XboxService } from "../../xbox/xbox.mjs";
import { aFakeXboxServiceWith } from "../../xbox/fakes/xbox.fake.mjs";
import type { TokenInfo } from "../../xbox/types.mjs";

const validToken = {
  token: "spartan-token",
  expiresAt: DateTime.fromISO("2025-01-01T03:00:00.000Z"),
};

const validKvToken: TokenInfo = {
  XSTSToken: "xsts-token",
  userHash: "user-hash",
  expiresOn: new Date("2025-01-01T03:00:00.000Z"),
};

describe("CustomSpartanTokenProvider", () => {
  let env: Env;
  let xboxService: XboxService;
  let provider: CustomSpartanTokenProvider;

  beforeEach(() => {
    env = aFakeEnvWith();
    xboxService = aFakeXboxServiceWith();
    provider = new CustomSpartanTokenProvider({ env, xboxService });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a spartan token string when XSTS token is valid", async () => {
    env.APP_DATA.get = vi.fn().mockResolvedValue(validToken);
    xboxService.tokenInfo = validKvToken;

    const token = await provider.getSpartanToken();

    expect(token).toBe(validToken.token);
  });
});
