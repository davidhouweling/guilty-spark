import { CredentialsAuthenticateInitialResponse } from "@xboxreplay/xboxlive-auth";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import { XboxService, XboxServiceOpts } from "../xbox.mjs";
import { addHours } from "date-fns";

export function aFakeXboxServiceWith(opts: Partial<XboxServiceOpts> = {}): XboxService {
  return new XboxService({
    env: aFakeEnvWith(),
    authenticate: (): Promise<CredentialsAuthenticateInitialResponse> =>
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
