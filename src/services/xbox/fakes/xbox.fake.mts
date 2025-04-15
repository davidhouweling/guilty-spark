import type { CredentialsAuthenticateInitialResponse } from "@xboxreplay/xboxlive-auth";
import { addHours } from "date-fns";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { XboxServiceOpts } from "../xbox.mjs";
import { XboxService } from "../xbox.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";

async function fakeAuthenticate(): Promise<CredentialsAuthenticateInitialResponse> {
  return Promise.resolve({
    xuid: "fake-xuid",
    xsts_token: "fake-xsts-token",
    user_hash: "fake-user-hash",
    expires_on: addHours(new Date(), 3).toISOString(),
    display_claims: {},
  });
}

export function aFakeXboxServiceWith(opts: Partial<XboxServiceOpts> = {}): XboxService {
  const env = opts.env ?? aFakeEnvWith();
  const logService = opts.logService ?? aFakeLogServiceWith();
  const authenticate = opts.authenticate ?? fakeAuthenticate;

  return new XboxService({
    env,
    logService,
    authenticate,
  });
}
