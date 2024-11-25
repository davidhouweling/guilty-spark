const fakeNamespace: KVNamespace = {
  getWithMetadata: () => Promise.resolve({ value: null, metadata: null, cacheStatus: null }),
  get: () => Promise.resolve(null),
  put: () => Promise.resolve(),
  list: () => Promise.resolve({ list_complete: true, keys: [], cacheStatus: null }),
  delete: () => Promise.resolve(),
};

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
  bind() {
    return this as unknown as D1PreparedStatement;
  }
  first() {
    return Promise.resolve(null);
  }
  run() {
    return Promise.resolve({ ...fakeD1Response, results: [] });
  }
  all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    return Promise.resolve({ ...fakeD1Response, results: [] as T[] });
  }
  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  raw<T = unknown[]>(_options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
    throw new Error("Not implemented");
  }
}

const fakeDb: D1Database = {
  prepare: () => new FakePreparedStatement(),
  batch: () => Promise.resolve([{ ...fakeD1Response, results: [] }]),
  exec: () => Promise.resolve({ count: 1, duration: 1 }),
  dump: () => Promise.resolve(new ArrayBuffer(1)),
};

export function aFakeEnvWith(env: Partial<Env> = {}): Env {
  const defaultOpts: Env = {
    DISCORD_APP_ID: "DISCORD_APP_ID",
    DISCORD_PUBLIC_KEY: "DISCORD_PUBLIC_KEY",
    DISCORD_TOKEN: "DISCORD_TOKEN",
    XBOX_USERNAME: "XBOX_USERNAME",
    XBOX_PASSWORD: "XBOX_PASSWORD",
    SERVICE_API_TOKENS: fakeNamespace,
    DB: fakeDb,
  };

  return {
    ...defaultOpts,
    ...env,
  };
}