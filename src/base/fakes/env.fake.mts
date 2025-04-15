const fakeNamespace = {
  getWithMetadata: async () => Promise.resolve({ value: null, metadata: null, cacheStatus: null }),
  get: async () => Promise.resolve(null),
  put: async () => Promise.resolve(),
  list: async () => Promise.resolve({ list_complete: true, keys: [], cacheStatus: null }),
  delete: async () => Promise.resolve(),
} as unknown as KVNamespace;

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

export class FakePreparedStatement /* extends D1PreparedStatement */ {
  bind(): D1PreparedStatement {
    return this as unknown as D1PreparedStatement;
  }
  async first(): Promise<null> {
    return Promise.resolve(null);
  }
  async run(): Promise<{ results: never[]; success: true; meta: D1Meta & Record<string, unknown>; error?: never }> {
    return Promise.resolve({ ...fakeD1Response, results: [] });
  }
  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve({ ...fakeD1Response, results: [] as T[] });
  }
  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  async raw<T = unknown[]>(_options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    throw new Error("Not implemented");
  }
}

const fakeDb: D1Database = {
  prepare: () => new FakePreparedStatement(),
  batch: async () => Promise.resolve([{ ...fakeD1Response, results: [] }]),
  exec: async () => Promise.resolve({ count: 1, duration: 1 }),
  dump: async () => Promise.resolve(new ArrayBuffer(1)),
  withSession: () => ({
    prepare: () => new FakePreparedStatement(),
    batch: async () => Promise.resolve([{ ...fakeD1Response, results: [] }]),
    getBookmark: () => null,
  }),
};

export function aFakeEnvWith(env: Partial<Env> = {}): Env {
  const defaultOpts: Env = {
    HOST_URL: "https://guilty-spark-dev.howling-dev.workers.dev",
    MODE: "development",
    DISCORD_APP_ID: "DISCORD_APP_ID",
    DISCORD_PUBLIC_KEY: "DISCORD_PUBLIC_KEY",
    DISCORD_TOKEN: "DISCORD_TOKEN",
    XBOX_USERNAME: "XBOX_USERNAME",
    XBOX_PASSWORD: "XBOX_PASSWORD",
    APP_DATA: fakeNamespace,
    DB: fakeDb,
  };

  return {
    ...defaultOpts,
    ...env,
  };
}
