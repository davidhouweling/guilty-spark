import type { CredentialsAuthenticateInitialResponse } from "@xboxreplay/xboxlive-auth";
import { addHours } from "date-fns";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { XboxServiceOpts } from "../xbox.mjs";
import { XboxService } from "../xbox.mjs";

export function aFakeXboxServiceWith(opts: Partial<XboxServiceOpts> = {}): XboxService {
  return new XboxService({
    env: aFakeEnvWith(),
    authenticate: async (): Promise<CredentialsAuthenticateInitialResponse> =>
      Promise.resolve({
        xuid: "fake-xuid",
        xsts_token: "fake-xsts-token",
        user_hash: "fake-user-hash",
        expires_on: addHours(new Date(), 3).toISOString(),
        display_claims: {},
      }),
    ...opts,
  });
}
