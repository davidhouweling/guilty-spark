# User Token Leverage in Individual Tracker Durable Object

## Scope

This document now covers two related scenarios:

1. Interactive user-started trackers from the browser (current implementation direction).
2. Unattended automation (future), such as Twitch live-event auto-start when the user is offline.

The same Microsoft OAuth tokens are used in both scenarios, but lifecycle and storage expectations differ.

## Current State

The interactive individual tracker flow now uses **user-scoped Microsoft tokens** passed from the authenticated session into the DO runtime.

Implemented high-level flow:

```
Frontend (authenticated user)
  ↓ includes session-backed token context on start
Backend /api/individual-tracker/manage/start (validates session, forwards user token context)
  ↓
Durable Object (stores token context in state for runtime)
  ↓
UserTokenProvider (MS access/refresh -> Xbox user token -> XSTS -> Spartan)
  ↓
Halo Infinite API as the authenticated user
```

Also implemented:

- Sanitized client-facing tracker state so token data is never returned in REST or WebSocket payloads.
- Explicit status/list routes for tracker runtime lookup (no implicit owner-only status bootstrap).

## Solution: Leverage User's Microsoft OAuth tokens

The solution is to **pass the user's OAuth tokens from the session cookie through to the Durable Object** and create a custom token provider for the Halo Infinite API client.

---

## Architecture Overview (Interactive Start)

```
Frontend (Session: { accessToken, refreshToken })
    ↓ passes tokens
Backend validates session & extracts { accessToken, refreshToken }
    ↓ includes in start request
Durable Object receives user tokens
    ↓ creates custom token provider
HaloInfiniteClient (with UserTokenProvider)
    ↓ makes calls as authenticated user
Halo Infinite API
```

---

## Technical Implementation Path (Interactive Start)

### 1. **Extend IndividualTrackerStartRequest to include tokens**

[api/durable-objects/individual-tracker/types.ts](api/durable-objects/individual-tracker/types.ts):

```typescript
export interface IndividualTrackerStartRequest {
  userId: string;
  trackerId: string;
  xuid: string;
  gamertag: string;
  searchStartTime: string;
  idleTimeoutHours: IdleTimeoutHours;

  // NEW: User's Microsoft OAuth tokens
  userMicrosoftAccessToken: string;
  userMicrosoftRefreshToken?: string;
}
```

### 2. **Backend extracts tokens from session and includes in start payload**

[api/server.ts](api/server.ts#L950-L980) (in `/api/individual-tracker/manage/start` handler):

```typescript
const session = await services.authService.validateSession(request);
if (session === null || session.isExpired) {
  return new Response("Unauthorized", { status: 401 });
}

// ... existing gamertag resolution logic ...

const doId = env.INDIVIDUAL_TRACKER_DO.idFromName(`${session.userId}:${trackerId}`);
const stub = env.INDIVIDUAL_TRACKER_DO.get(doId);

const startPayload: IndividualTrackerStartRequest = {
  userId: session.userId,
  trackerId,
  xuid: resolvedXuid,
  gamertag: resolvedGamertag,
  searchStartTime,
  idleTimeoutHours,

  // NEW: Pass user's tokens
  userMicrosoftAccessToken: session.accessToken,
  userMicrosoftRefreshToken: session.refreshToken,
};
```

### 3. **Create UserTokenProvider for Halo Infinite Client**

[api/services/halo/user-token-provider.ts](api/services/halo/user-token-provider.ts) (NEW FILE):

```typescript
import { HaloAuthenticationClient, type SpartanTokenProvider } from "halo-infinite-api";
import { DateTime } from "luxon";
import type { MicrosoftAuthService } from "../auth/microsoft-auth";

interface UserTokenProviderOpts {
  userMicrosoftAccessToken: string;
  userMicrosoftRefreshToken?: string;
  microsoftAuthService: MicrosoftAuthService;
}

/**
 * Custom SpartanTokenProvider that refreshes user's Microsoft OAuth token
 * and exchanges for Halo Spartan token, operating as the logged-in user.
 */
export class UserTokenProvider extends HaloAuthenticationClient implements SpartanTokenProvider {
  private currentSpartanToken: string | null = null;
  private spartanTokenExpiresAt: DateTime | null = null;
  private userTokenInfo: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
  };

  constructor({ userMicrosoftAccessToken, userMicrosoftRefreshToken, microsoftAuthService }: UserTokenProviderOpts) {
    // HaloAuthenticationClient handles the OAuth→XSTS→Spartan flow
    super(
      {
        // Fetch XSTS token using the user's Microsoft access token
        fetchToken: async () => {
          const refreshedToken = await this.ensureValidMicrosoftToken();
          // Use user's token for XSTS exchange (not bot account)
          return refreshedToken;
        },
        clearXstsToken: async () => {
          // No-op: we don't clear during normal operation
        },
      },
      {
        // Store Spartan tokens in-memory within DO state
        loadToken: async () => ({
          token: this.currentSpartanToken ?? undefined,
          expiresAt: this.spartanTokenExpiresAt?.toJSDate(),
        }),
        saveToken: async (token) => {
          this.currentSpartanToken = token.token;
          this.spartanTokenExpiresAt = DateTime.fromJSDate(token.expiresAt);
        },
        clearToken: async () => {
          this.currentSpartanToken = null;
          this.spartanTokenExpiresAt = null;
        },
      },
    );

    this.userTokenInfo = {
      accessToken: userMicrosoftAccessToken,
      refreshToken: userMicrosoftRefreshToken,
    };
  }

  /**
   * Ensure the user's Microsoft token is valid, refreshing if needed.
   * Returns the valid access token for XSTS exchange.
   */
  private async ensureValidMicrosoftToken(): Promise<string> {
    const now = Date.now();
    const expiresAt = this.userTokenInfo.expiresAt ?? 0;

    // Token still valid and not expiring soon (5-minute buffer)
    if (expiresAt > now + 5 * 60 * 1000) {
      return this.userTokenInfo.accessToken;
    }

    // Need to refresh
    if (this.userTokenInfo.refreshToken) {
      // Call Microsoft OAuth refresh endpoint
      const refreshResponse = await fetch("https://login.microsoftonline.com/consumers/oauth2/v2.0/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: this.userTokenInfo.refreshToken,
          // ... client credentials from env ...
        }).toString(),
      });

      if (!refreshResponse.ok) {
        throw new Error(`Failed to refresh user token: ${refreshResponse.status}`);
      }

      const refreshData = await refreshResponse.json<{
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      }>();

      this.userTokenInfo.accessToken = refreshData.access_token;
      if (refreshData.refresh_token) {
        this.userTokenInfo.refreshToken = refreshData.refresh_token;
      }
      this.userTokenInfo.expiresAt = now + refreshData.expires_in * 1000;

      return this.userTokenInfo.accessToken;
    }

    // No refresh token available, token expired
    throw new Error("User token expired and no refresh token available");
  }
}
```

### 4. **Update DO constructor and service installation**

[api/durable-objects/individual-tracker/individual-tracker-do.ts](api/durable-objects/individual-tracker/individual-tracker-do.ts):

```typescript
export class IndividualTrackerDO implements DurableObject, Rpc.DurableObjectBranded {
  // ...
  private userTokens?: {
    accessToken: string;
    refreshToken?: string;
  };

  constructor(state: DurableObjectState, env: Env, installServices = installServicesImpl) {
    this.state = state;
    // Services will be created with optional user token provider
    const services = installServices({ env });
    this.logService = services.logService;
    this.databaseService = services.databaseService;
  }

  private async handleStart(request: Request): Promise<Response> {
    const body = await request.json<IndividualTrackerStartRequest>();

    // Store user tokens for this DO's lifetime
    this.userTokens = {
      accessToken: body.userMicrosoftAccessToken,
      refreshToken: body.userMicrosoftRefreshToken,
    };

    // ... existing state initialization ...
  }
}
```

### 5. **Modify service installation for user-scoped client**

[api/services/install.ts](api/services/install.ts):

```typescript
export interface InstallServicesOpts {
  env: Env;
  userTokens?: {
    accessToken: string;
    refreshToken?: string;
  };
}

export function installServices({ env, userTokens }: InstallServicesOpts): Services {
  // ... existing setup ...

  // If user tokens provided, use UserTokenProvider instead of bot account
  const spartanTokenProvider: SpartanTokenProvider = userTokens
    ? new UserTokenProvider({
        userMicrosoftAccessToken: userTokens.accessToken,
        userMicrosoftRefreshToken: userTokens.refreshToken,
        microsoftAuthService, // Pass MS auth service for token refresh
      })
    : new CustomSpartanTokenProvider({ env, xboxService }); // Fallback to bot

  const haloInfiniteClient: HaloInfiniteClient = useProxy
    ? createHaloInfiniteClientProxy({ env })
    : new HaloInfiniteClient(
        spartanTokenProvider,
        createResilientFetch({ env, logService, proxyUrl: env.PROXY_WORKER_URL }),
      );

  // ... rest of services ...
}
```

---

## Future Scenario: Unattended Auto-Start (Twitch Live)

### Requirements shift

For unattended auto-start, the user may be offline for days or weeks. This requires server-side durable storage of credentials that can be refreshed without browser involvement.

Key implications:

- Do not depend on browser session cookies for automation triggers.
- Treat refresh tokens as high-sensitivity delegated credentials.
- Build explicit recovery path when refresh is revoked or expired.

### Recommended architecture for unattended flow

```
Twitch EventSub webhook
  ↓ (verified + deduplicated)
Queue consumer / worker job
  ↓
Credential broker loads user's stored encrypted refresh token
  ↓
Refresh on demand if access token is stale
  ↓
Start tracker via trusted internal route/service
  ↓
Individual DO receives fresh token context
```

### Refresh strategy for unattended mode

- Default: lazy refresh on demand (no cron required for correctness).
- Optional: proactive refresh cron only for UX/operability improvements.

Why lazy refresh is sufficient:

- If the user does not stream for weeks, there is no need to refresh in between.
- Access token can be refreshed when the next live event arrives.
- If refresh fails (`invalid_grant`), mark integration as reconnect-required and skip auto-start safely.

### Storage model guidance

Use D1 (Cloudflare SQLite) naming and constraints aligned to current schema conventions.

Suggested table for future phase:

- `UserOAuthCredentials`
  - `CredentialId` TEXT PRIMARY KEY
  - `UserId` TEXT NOT NULL
  - `Provider` TEXT NOT NULL CHECK (`Provider` IN ('microsoft', 'twitch'))
  - `AccessTokenEncrypted` TEXT NOT NULL
  - `RefreshTokenEncrypted` TEXT
  - `ExpiresAt` INTEGER NOT NULL
  - `LastRefreshedAt` INTEGER
  - `Status` TEXT NOT NULL CHECK (`Status` IN ('active', 'reauth-required', 'revoked')) DEFAULT 'active'
  - `CreatedAt` INTEGER NOT NULL DEFAULT (unixepoch())
  - `UpdatedAt` INTEGER NOT NULL DEFAULT (unixepoch())

Notes:

- Encrypt tokens at rest before persisting.
- Never log token values.
- Keep decryption and refresh inside server-only worker paths.

## Token Storage Options & Trade-Offs

### Option 1: Store in Durable Object State (RECOMMENDED for interactive tracker runtime)

**Approach**: Keep tokens in DO state memory for the session duration.

```typescript
export interface IndividualTrackerState {
  // ... existing fields ...
  userMicrosoftTokens?: {
    accessToken: string;
    refreshToken?: string;
  };
}
```

**Pros:**

- ✅ Tokens only held during active tracking (session-scoped)
- ✅ Cloudflare Durable Objects have isolated state (not publicly accessible)
- ✅ Automatic disposal when tracker stops
- ✅ No additional latency for token lookups
- ✅ Simplest implementation

**Cons:**

- ❌ Tokens stored unencrypted in DO state (but same as session cookie)
- ❌ If DO crashes, tokens lost (acceptable for ephemeral tracker)

**Best For:**

- Individual tracker use case (short-lived, session-scoped)
- User-scoped workflow (tokens held only during active tracking)
- Single DO per user session

---

### Option 2: Cloudflare KV with Encryption

**Approach**: Encrypt and store tokens in KV, pass reference to DO.

```typescript
const tokenKeyPrefix = `user-tokens:${userId}:`;
const encrypted = await encryptTokens(userTokens, env.TOKEN_ENCRYPTION_KEY);
await env.APP_DATA.put(tokenKeyPrefix + trackerId, encrypted, { expirationTtl: 12 * 3600 });

// In DO:
const encrypted = await env.APP_DATA.get(tokenKeyPrefix + trackerId);
const userTokens = decryptTokens(encrypted, env.TOKEN_ENCRYPTION_KEY);
```

**Pros:**

- ✅ Tokens encrypted at rest
- ✅ Survives DO restarts
- ✅ Easy to audit/revoke per-tracker
- ✅ Explicit TTL prevents stale tokens

**Cons:**

- ❌ Extra latency (KV request per token refresh)
- ❌ Complexity: encryption/decryption overhead
- ❌ KV lookups during token refresh (every ~45 minutes)

**Best For:**

- Long-lived trackers (days/weeks)
- Multi-tenant scenarios with audit requirements
- Persistent token storage needed across restarts

---

### Option 3: D1 Database with Encryption

**Approach**: Store encrypted tokens in D1, keyed by userId:trackerId.

```typescript
await db
  .prepare(
    `
  INSERT INTO user_tracker_tokens (user_id, tracker_id, encrypted_tokens, expires_at)
  VALUES (?1, ?2, ?3, ?4)
`,
  )
  .bind(userId, trackerId, encryptedTokens, expiryTime)
  .run();
```

**Pros:**

- ✅ Tokens persisted and encrypted
- ✅ Full audit trail (who accessed what token)
- ✅ Can query/revoke by user or tracker
- ✅ Native to existing DB schema

**Cons:**

- ❌ DB latency on every token refresh (~100-300ms)
- ❌ Synchronization complexity if active in multiple DOs
- ❌ Encryption key management

**Best For:**

- Enterprise scenarios with compliance requirements
- Needing permanent audit trail
- Cross-DO token sharing (multiple instances tracking same user)
- Unattended automation such as Twitch auto-start

---

### Option 4: Pass Refresh Token Only (Frontend Manages Refresh)

**Approach**: DO holds only refresh token, frontend gets new access token on demand.

```typescript
// Frontend:
const newAccessToken = await microsoftAuthService.refreshToken(refreshToken);
// Pass in next request to DO
```

**Pros:**

- ✅ Minimal data in DO state
- ✅ Frontend manages token lifecycle
- ✅ Natural separation of concerns
- ✅ Can revoke from frontend easily

**Cons:**

- ❌ Extra roundtrip for every token refresh
- ❌ Sync complexity between frontend/DO
- ❌ Network latency during tracker updates

**Best For:**

- Rarely-updated trackers
- Where frontend can serve as token keeper
- Interactive workflows only

---

## Recommended Approach for Guilty Spark

Use a dual-mode approach:

1. Interactive manual start: Option 1 (DO state) for runtime convenience.
2. Future unattended auto-start: Option 3 (encrypted D1 credential store) as the durable source of truth.

Rationale:

- Current manual flow benefits from simplicity and low latency.
- Future automation requires durable server-side refresh capability without a browser session.

1. **Individual tracker is session-scoped**: Token only needed while tracker is active
2. **Automatic cleanup**: When tracker stops, tokens are disposed
3. **No compliance requirements**: Personal tracking, not sensitive
4. **Simplicity**: Straightforward implementation, minimal infrastructure
5. **Cloudflare security model**: DO state is isolated and not externally accessible

```typescript
export interface IndividualTrackerState {
  // ... existing fields ...
  userMicrosoftTokens: {
    accessToken: string;
    refreshToken?: string;
  } | null; // null when using bot account (fallback)
}
```

**Security considerations:**

- Tokens only held for active tracking session (typically 3-minute refresh cycle)
- DO discards tokens when tracker stops (explicit disposal)
- Even if compromised, token is temporary and scoped to Halo API
- Refresh tokens enable auto-renewal without re-authentication

---

## Implementation Checklist

### Phase 1: Backend Token Passing (Frontend → DO)

- [x] Extend `IndividualTrackerStartRequest` with user tokens
- [x] Update `/api/individual-tracker/manage/start` to extract tokens from session
- [x] Update DO `handleStart` to accept and store user tokens

### Phase 2: Custom Token Provider

- [x] Create `UserTokenProvider` implementing `SpartanTokenProvider`
- [x] Handle Microsoft token refresh with proper error handling
- [x] Test token refresh flow (mock expired token scenario)

### Phase 3: Service Layer Integration

- [x] Modify service wiring to support user-scoped token provider for individual tracker runtime
- [x] Create user-scoped vs. bot-scoped client behavior in runtime client construction
- [x] Update DO runtime path to build Halo client using user token context when available

### Phase 4: Testing & Validation

- [~] Test tracker with user's Xbox account (verify stats shown)
- [ ] Test token refresh during long-running tracker
- [ ] Test fallback to bot account if tokens unavailable
- [ ] Test with expired/invalid refresh token

### Phase 5: Auto-start readiness (future)

- [ ] Add encrypted server-side credential storage for unattended starts.
- [ ] Add credential broker service (`getValidAccessToken(userId, provider)`).
- [ ] Add trusted internal auto-start path for Twitch live events.
- [ ] Mark integration as reconnect-required when refresh is invalid/revoked.

### Phase 6: Optional Enhancements

- [ ] Add token refresh logging to diagnostic endpoints
- [ ] Add UI indicator showing which account tracker is using
- [ ] Implement token revocation endpoint (explicit cleanup)
- [ ] Add metrics for token refresh success/failures

## What I need from David to verify

Please run these environment-level validations and share results so we can close remaining risk:

1. Confirm interactive start on your account consistently loads your expected matches/stats (not bot-account data).
2. Keep one tracker running long enough to cross a Microsoft access-token expiry boundary, then confirm tracking continues without manual re-auth.
3. Stop a tracker and confirm follow-up status for that tracker returns not-found/null state and no token data appears in any client payload.
4. If possible, test one invalid refresh-token case (or revoked consent) and share logs so we can validate failure handling path and user-facing behavior.
5. Share any server log snippets that indicate token refresh or XSTS/Spartan exchange failures in your environment.

---

## Risk Mitigation

| Risk                                        | Mitigation                                         |
| ------------------------------------------- | -------------------------------------------------- |
| Tokens exposed in transit                   | Already HTTPS-only, session cookies validated      |
| Tokens stored in DO state unencrypted       | Tokens limited to session duration; DO isolated    |
| Refresh token causes infinite loops         | Implement max retry logic with exponential backoff |
| User revokes consent mid-tracking           | Graceful fallback to bot account for that session  |
| Multiple DO instances competing for refresh | Each DO manages its own token independently        |

---

## References

- [halo-infinite-api SpartanTokenProvider interface](https://github.com/GravlLift/halo-infinite-api/blob/master/src/client/SpartanTokenProvider.ts)
- [halo-infinite-api AutoTokenProvider implementation](https://github.com/GravlLift/halo-infinite-api/blob/master/src/client/AutoTokenProvider.ts)
- [Cloudflare Durable Objects security model](https://developers.cloudflare.com/workers/platform/storage/durable-objects/)
- [Guilty Spark auth flow](api/services/auth/auth.ts)
