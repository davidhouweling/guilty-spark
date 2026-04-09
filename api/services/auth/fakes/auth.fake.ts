import { AuthService } from "../auth";
import { MicrosoftAuthService } from "../microsoft-auth";

export function aFakeAuthServiceWith(env: Partial<Env> = {}): AuthService {
  const microsoftAuthService = new MicrosoftAuthService({
    clientId: env.MICROSOFT_CLIENT_ID ?? "test-client-id",
    clientSecret: env.MICROSOFT_CLIENT_SECRET ?? "test-client-secret",
    redirectUri: env.MICROSOFT_REDIRECT_URI ?? "http://localhost:8787/auth/microsoft/callback",
  });

  return new AuthService({
    microsoftAuthService,
    sessionSecret: env.SESSION_SECRET ?? "a".repeat(64),
  });
}
