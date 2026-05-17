import { AuthService } from "../auth";
import { aFakeDatabaseServiceWith } from "../../database/fakes/database.fake";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";

export function aFakeAuthServiceWith(env: Partial<Env & { databaseService: ReturnType<typeof aFakeDatabaseServiceWith> }> = {}): AuthService {
  const fakeEnv = aFakeEnvWith(env);

  return new AuthService({
    microsoftClientId: env.MICROSOFT_CLIENT_ID ?? "test-client-id",
    microsoftClientSecret: env.MICROSOFT_CLIENT_SECRET ?? "test-client-secret",
    microsoftRedirectUri: env.MICROSOFT_REDIRECT_URI ?? "http://localhost:8787/auth/microsoft/callback",
    sessionSecret: env.SESSION_SECRET ?? "a".repeat(64),
    databaseService: env.databaseService ?? aFakeDatabaseServiceWith({ env: fakeEnv }),
  });
}
