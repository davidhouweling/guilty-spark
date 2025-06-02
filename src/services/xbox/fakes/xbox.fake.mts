import type { authenticate, AuthenticateResponse, XNETExchangeTokensResponse } from "@xboxreplay/xboxlive-auth";
import { addHours } from "date-fns";
import { aFakeEnvWith } from "../../../base/fakes/env.fake.mjs";
import type { XboxServiceOpts } from "../xbox.mjs";
import { XboxService } from "../xbox.mjs";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake.mjs";

const fakeAuthenticate = async (): Promise<AuthenticateResponse> => {
  const now = new Date();
  const expires = addHours(now, 1);

  const userHashValue = "fake-user-hash-12345";
  const userXuidValue = "fake-xuid-67890";
  const xstsTokenValue = "fake-xsts-token-value";

  const displayClaimsValue: XNETExchangeTokensResponse["DisplayClaims"] = {
    xui: [
      {
        uhs: userHashValue,
        xid: userXuidValue,
      } as { xid?: string; uhs: string } & (string & {}), // Casting for complex type
    ],
  };

  const response: AuthenticateResponse = {
    xuid: userXuidValue,
    user_hash: userHashValue,
    xsts_token: xstsTokenValue,
    display_claims: displayClaimsValue,
    expires_on: expires.toISOString(),
  };

  return Promise.resolve(response);
};

export function aFakeXboxServiceWith(opts: Partial<XboxServiceOpts> = {}): XboxService {
  const env = opts.env ?? aFakeEnvWith();
  const logService = opts.logService ?? aFakeLogServiceWith();
  const authenticateToUse = (opts.authenticate ?? fakeAuthenticate) as typeof authenticate;

  return new XboxService({
    env,
    logService,
    authenticate: authenticateToUse,
  });
}
