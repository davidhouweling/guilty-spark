const fakeNamespace: KVNamespace = {
  getWithMetadata: () => Promise.resolve({ value: null, metadata: null, cacheStatus: null }),
  get: () => Promise.resolve(null),
  put: () => Promise.resolve(),
  list: () => Promise.resolve({ list_complete: true, keys: [], cacheStatus: null }),
  delete: () => Promise.resolve(),
};

const fakeD1Response: D1Response = {
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

const prepare: D1PreparedStatement = {
  bind: () => prepare,
  first: () => Promise.resolve(null),
  run: () => Promise.resolve({ ...fakeD1Response, results: [] }),
  all: () => Promise.resolve({ ...fakeD1Response, results: [] }),
  raw: () => {
    throw new Error("Not implemented");
  },
};

const fakeDb: D1Database = {
  prepare: () => prepare,
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
