import { mock } from "vitest-mock-extended";
import { aFakeLiveTrackerDOWith } from "../../durable-objects/live-tracker/fakes/live-tracker-do.fake";
import { aFakeIndividualTrackerDOWith } from "../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import { aFakeUserTrackerDOWith } from "../../durable-objects/user-tracker/fakes/user-tracker-do.fake";
import { aFakeDurableObjectNamespaceWith } from "./do.fake";
import { aFakeQueueWith } from "./queue.fake";

const fakeNamespace = (): KVNamespace =>
  ({
    getWithMetadata: async () => Promise.resolve({ value: null, metadata: null, cacheStatus: null }),
    get: async () => Promise.resolve(null),
    put: async () => Promise.resolve(),
    list: async () => Promise.resolve({ list_complete: true, keys: [], cacheStatus: null }),
    delete: async () => Promise.resolve(),
  }) as unknown as KVNamespace;

export const fakeD1Response: D1Response = {
  success: true,
  meta: {
    changed_db: true,
    changes: 1,
    duration: 1,
    last_row_id: 1,
    rows_read: 1,
    rows_written: 1,
    size_after: 1,
  },
};

class FakePreparedStatement<T> {
  bind(): this {
    return this;
  }
  async first(): Promise<T> {
    return Promise.resolve(null as T);
  }
  async run(): Promise<{ results: never[]; success: true; meta: D1Meta & Record<string, unknown>; error?: never }> {
    return Promise.resolve({ ...fakeD1Response, results: [] });
  }
  async all<U = Record<string, unknown>>(): Promise<D1Result<U>> {
    return Promise.resolve({ ...fakeD1Response, results: [] as U[] });
  }
  raw<V = unknown[]>(options: { columnNames: true }): Promise<[string[], ...V[]]>;
  raw<V = unknown[]>(options?: { columnNames?: false }): Promise<V[]>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  async raw<V = unknown[]>(_options?: { columnNames?: boolean }): Promise<V[] | [string[], ...V[]]> {
    throw new Error("Not implemented");
  }
}

// Cloudflare's D1PreparedStatement is unavailable in Node; expose this fake's structural type.
export function aFakePreparedStatement<T>(): Pick<FakePreparedStatement<T>, keyof FakePreparedStatement<T>> {
  return new FakePreparedStatement<T>();
}

const fakeDb = (): D1Database => {
  const database = mock<D1Database>();
  const session = mock<D1DatabaseSession>();
  database.prepare.mockImplementation(() => aFakePreparedStatement());
  database.batch.mockResolvedValue([{ ...fakeD1Response, results: [] }]);
  database.exec.mockResolvedValue({ count: 1, duration: 1 });
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Still required by the D1Database interface.
  database.dump.mockResolvedValue(new ArrayBuffer(1));
  database.withSession.mockReturnValue(session);
  session.prepare.mockImplementation(() => aFakePreparedStatement());
  session.batch.mockResolvedValue([{ ...fakeD1Response, results: [] }]);
  session.getBookmark.mockReturnValue(null);
  return database;
};

export function aFakeEnvWith(env: Partial<Env> = {}): Env {
  const liveTrackerGet = aFakeLiveTrackerDOWith();
  const individualTrackerGet = aFakeIndividualTrackerDOWith();
  const userTrackerGet = aFakeUserTrackerDOWith();

  const defaultOpts: Env = {
    HOST_URL: "http://localhost:8787",
    PAGES_URL: "http://localhost:4321",
    COOKIE_DOMAIN: "",
    MODE: "development",
    DISCORD_APP_ID: "DISCORD_APP_ID",
    DISCORD_PUBLIC_KEY: "DISCORD_PUBLIC_KEY",
    DISCORD_TOKEN: "DISCORD_TOKEN",
    XBOX_USERNAME: "XBOX_USERNAME",
    XBOX_PASSWORD: "XBOX_PASSWORD",
    APP_DATA: fakeNamespace(),
    DB: fakeDb(),
    SENTRY_AUTH_TOKEN: "sentry-auth-token",
    MICROSOFT_CLIENT_ID: "test-client-id",
    MICROSOFT_CLIENT_SECRET: "test-client-secret",
    MICROSOFT_TENANT: "consumers",
    MICROSOFT_REDIRECT_URI: "http://localhost:8787/auth/microsoft/callback",
    MICROSOFT_SCOPES: "openid email offline_access XboxLive.signin XboxLive.offline_access",
    SESSION_SECRET: "a".repeat(64),
    TOKEN_ENCRYPTION_SECRET: "c".repeat(64),
    LIVE_TRACKER_DO: aFakeDurableObjectNamespaceWith(liveTrackerGet),
    INDIVIDUAL_TRACKER_DO: aFakeDurableObjectNamespaceWith(individualTrackerGet),
    USER_TRACKER_DO: aFakeDurableObjectNamespaceWith(userTrackerGet),
    FILM_ANALYTICS_QUEUE: aFakeQueueWith(),
  };

  return {
    ...defaultOpts,
    ...env,
  };
}
