import type { AuthService, MicrosoftStartResponse, SessionResponse } from "../types";

interface FakeAuthServiceOptions {
  readonly session: SessionResponse;
  readonly microsoftStartResponse: MicrosoftStartResponse;
}

export interface FakeAuthServiceFactoryOpts {
  readonly session?: SessionResponse;
  readonly microsoftStartResponse?: MicrosoftStartResponse;
}

export class FakeAuthService implements AuthService {
  private readonly options: FakeAuthServiceOptions;

  public constructor(options?: Partial<FakeAuthServiceOptions>) {
    this.options = {
      session: options?.session ?? { authenticated: false },
      microsoftStartResponse: options?.microsoftStartResponse ?? {
        authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        state: "fake-state",
      },
    };
  }

  public async getSession(): Promise<SessionResponse> {
    await Promise.resolve();
    return this.options.session;
  }

  public async startMicrosoftAuth(redirectTo?: string): Promise<MicrosoftStartResponse> {
    void redirectTo;
    await Promise.resolve();
    return this.options.microsoftStartResponse;
  }
}

export function aFakeAuthServiceWith(opts: FakeAuthServiceFactoryOpts = {}): FakeAuthService {
  return new FakeAuthService({
    session: opts.session,
    microsoftStartResponse: opts.microsoftStartResponse,
  });
}
