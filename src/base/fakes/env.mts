class MockD1Database extends D1Database {}

export function aFakeEnvWith(env: Partial<Env> = {}): Env {
  return {
    SERVICE_API_TOKENS: {
      get: () => Promise.resolve(null),
      list: () => {
        throw new Error("Not implemented");
      },
      put: () => Promise.resolve(),
      getWithMetadata: () => {
        throw new Error("Not implemented");
      },
      delete: () => Promise.resolve(),
    },
    DISCORD_APP_ID: "discord-app-id",
    DISCORD_PUBLIC_KEY: "discord-public-key",
    DISCORD_TOKEN: "discord-token",
    XBOX_USERNAME: "xbox-username",
    XBOX_PASSWORD: "xbox-password",
    DB: new MockD1Database(),
    ...env,
  };
}
