import { AuthService } from "../auth";

export function aFakeAuthServiceWith(env: Partial<Env> = {}): AuthService {
  return new AuthService({
    microsoftClientId: env.MICROSOFT_CLIENT_ID ?? "test-client-id",
    microsoftClientSecret: env.MICROSOFT_CLIENT_SECRET ?? "test-client-secret",
    microsoftRedirectUri: env.MICROSOFT_REDIRECT_URI ?? "http://localhost:8787/auth/microsoft/callback",
    sessionSecret: env.SESSION_SECRET ?? "a".repeat(64),
  });
}
