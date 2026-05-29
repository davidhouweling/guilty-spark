import type { SessionResponse } from "@guilty-spark/shared/contracts/auth/session";
import type { MicrosoftStartResponse } from "@guilty-spark/shared/contracts/auth/microsoft/start";
import type { AuthService } from "../types";

// Self-contained SVG data URI so fake mode renders an avatar without any network access.
const FAKE_AVATAR_DATA_URI =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='48'%20height='48'%3E%3Crect%20width='48'%20height='48'%20fill='%23107C10'/%3E%3Ccircle%20cx='24'%20cy='19'%20r='9'%20fill='%23ffffff'/%3E%3Crect%20x='12'%20y='31'%20width='24'%20height='13'%20rx='6'%20fill='%23ffffff'/%3E%3C/svg%3E";

const DEFAULT_FAKE_SESSION: SessionResponse = {
  authenticated: true,
  userId: "fake-user-id",
  expiresAt: 4102444800000, // 2100-01-01T00:00:00Z
  avatarUrl: FAKE_AVATAR_DATA_URI,
  xboxGamertag: "Fake Spartan",
  xboxXuid: "2533274800000001",
};

const DEFAULT_FAKE_MICROSOFT_START: MicrosoftStartResponse = {
  authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
  state: "fake-state",
};

interface FakeAuthServiceOptions {
  readonly session: SessionResponse;
  readonly microsoftStartResponse: MicrosoftStartResponse;
}

export interface FakeAuthServiceFactoryOpts {
  readonly session?: SessionResponse;
  readonly microsoftStartResponse?: MicrosoftStartResponse;
}

export class FakeAuthService implements AuthService {
  private session: SessionResponse;
  private readonly microsoftStartResponse: MicrosoftStartResponse;

  public constructor(options?: Partial<FakeAuthServiceOptions>) {
    this.session = options?.session ?? DEFAULT_FAKE_SESSION;
    this.microsoftStartResponse = options?.microsoftStartResponse ?? DEFAULT_FAKE_MICROSOFT_START;
  }

  public async getSession(): Promise<SessionResponse> {
    await Promise.resolve();
    return this.session;
  }

  public async startMicrosoftAuth(redirectTo?: string): Promise<MicrosoftStartResponse> {
    void redirectTo;
    await Promise.resolve();
    return this.microsoftStartResponse;
  }

  public async logout(): Promise<void> {
    await Promise.resolve();
    this.session = { authenticated: false };
  }
}

export function aFakeAuthServiceWith(opts: FakeAuthServiceFactoryOpts = {}): FakeAuthService {
  return new FakeAuthService({
    ...(opts.session !== undefined ? { session: opts.session } : {}),
    ...(opts.microsoftStartResponse !== undefined ? { microsoftStartResponse: opts.microsoftStartResponse } : {}),
  });
}
