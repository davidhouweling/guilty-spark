import { aFakeLiveTrackerDOWith } from "../../durable-objects/live-tracker/fakes/live-tracker-do.fake";
import { aFakeIndividualTrackerDOWith } from "../../durable-objects/individual-tracker/fakes/individual-tracker-do.fake";
import { aFakeUserTrackerDOWith } from "../../durable-objects/user-tracker/fakes/user-tracker-do.fake";
import { aFakeDurableObjectNamespaceWith } from "./do.fake";

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

export class FakePreparedStatement<T> /* extends D1PreparedStatement */ {
  bind(): D1PreparedStatement {
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

const fakeDb = (): D1Database => ({
  prepare: () => new FakePreparedStatement(),
  batch: async () => Promise.resolve([{ ...fakeD1Response, results: [] }]),
  exec: async () => Promise.resolve({ count: 1, duration: 1 }),
  dump: async () => Promise.resolve(new ArrayBuffer(1)),
  withSession: () => ({
    prepare: () => new FakePreparedStatement(),
    batch: async () => Promise.resolve([{ ...fakeD1Response, results: [] }]),
    getBookmark: () => null,
  }),
});

export function aFakeEnvWith(env: Partial<Env> = {}): Env {
  const liveTrackerGet = aFakeLiveTrackerDOWith();
  const individualTrackerGet = aFakeIndividualTrackerDOWith();
  const userTrackerGet = aFakeUserTrackerDOWith();

  const defaultOpts: Env = {
    HOST_URL: "http://localhost:8787",
    PAGES_URL: "http://localhost:4321",
    MODE: "development",
    DISCORD_APP_ID: "DISCORD_APP_ID",
    DISCORD_PUBLIC_KEY: "DISCORD_PUBLIC_KEY",
    DISCORD_TOKEN: "DISCORD_TOKEN",
    XBOX_USERNAME: "XBOX_USERNAME",
    XBOX_PASSWORD: "XBOX_PASSWORD",
    APP_DATA: fakeNamespace(),
    DB: fakeDb(),
    PROXY_WORKER_URL: "https://api.guilty-spark.app",
    PROXY_WORKER_TOKEN: "worker-token",
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
  };

  return {
    ...defaultOpts,
    ...env,
  };
}
