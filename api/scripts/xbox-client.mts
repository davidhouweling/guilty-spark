import "dotenv/config";
import { inspect } from "node:util";
import { authenticate, XSAPIClient } from "@xboxreplay/xboxlive-auth";

// GET request
const authenticateResult = await authenticate(
  process.env.XBOX_USERNAME as `${string}@${string}.${string}`,
  process.env.XBOX_PASSWORD,
);

console.log(authenticateResult);

const data = await XSAPIClient.get(
  "https://profile.xboxlive.com/users/xuid(2533274844642438)/profile/settings?settings=Gamertag",
  {
    options: { contractVersion: 2, userHash: authenticateResult.user_hash, XSTSToken: authenticateResult.xsts_token },
  },
);

console.log(inspect(data, { depth: null, colors: true }));
