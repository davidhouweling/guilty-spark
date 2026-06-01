import { vi } from "vitest";

export function aFakeDurableObjectId(value = "fake-do-id"): DurableObjectId {
  return {
    toString: () => value,
    equals: (other: DurableObjectId) => other.toString() === value,
  };
}

export function aFakeDurableObjectNamespaceWith<T extends Rpc.DurableObjectBranded>(
  stub: DurableObjectStub<T>,
): DurableObjectNamespace<T> {
  const id = aFakeDurableObjectId();
  return {
    idFromName: () => id,
    idFromString: () => id,
    newUniqueId: () => id,
    getByName: () => stub,
    get: () => stub,
    jurisdiction: () => ({}) as DurableObjectNamespace<T>,
  };
}

export function aFakeSqlStorage(opts: Partial<SqlStorage> = {}): SqlStorage {
  return {
    exec: vi.fn(),
    databaseSize: 0,
    Cursor: vi.fn() as never, // Mock constructor
    Statement: vi.fn() as never, // Mock constructor
    ...opts,
  } satisfies SqlStorage;
}

export function aFakeDurableObjectStorageWith(opts: Partial<DurableObjectStorage> = {}): DurableObjectStorage {
  return {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    deleteAll: vi.fn(),
    setAlarm: vi.fn(),
    getAlarm: vi.fn(),
    deleteAlarm: vi.fn(),
    getBookmarkForTime: vi.fn(),
    getCurrentBookmark: vi.fn(),
    list: vi.fn(),
    onNextSessionRestoreBookmark: vi.fn(),
    sql: aFakeSqlStorage(),
    sync: vi.fn(),
    transaction: vi.fn(),
    transactionSync: vi.fn(),
    kv: {} as unknown as DurableObjectStorage["kv"],
    ...opts,
  };
}

export interface FakeServerWebSocket {
  readonly sent: string[];
  readonly closes: { code: number; reason: string }[];
  send: (message: string) => void;
  close: (code: number, reason: string) => void;
}

export function aFakeServerWebSocket(opts: { failSend?: boolean } = {}): FakeServerWebSocket {
  const sent: string[] = [];
  const closes: { code: number; reason: string }[] = [];
  return {
    sent,
    closes,
    send: (message: string): void => {
      if (opts.failSend === true) {
        throw new Error("send failed");
      }
      sent.push(message);
    },
    close: (code: number, reason: string): void => {
      closes.push({ code, reason });
    },
  };
}

export function installFakeWebSocketPair(): { client: object; server: FakeServerWebSocket } {
  const pair = { client: {}, server: aFakeServerWebSocket() };
  const FakeWebSocketPair = function (this: Record<number, object>): void {
    this[0] = pair.client;
    this[1] = pair.server;
  };
  (globalThis as unknown as { WebSocketPair: unknown }).WebSocketPair = FakeWebSocketPair;
  return pair;
}

export function aFakeDurableObjectStateWith(
  opts: Partial<DurableObjectState & { storage: DurableObjectStorage }> = {},
): DurableObjectState & { storage: DurableObjectStorage } {
  return {
    storage: aFakeDurableObjectStorageWith(opts.storage),
    props: {},
    exports: {} as Cloudflare.Exports,
    abort: () => void 0,
    acceptWebSocket: () => void 0,
    blockConcurrencyWhile: async (cb) => cb(),
    getHibernatableWebSocketEventTimeout: () => 0,
    getTags: () => [],
    getWebSocketAutoResponse: () => null,
    getWebSocketAutoResponseTimestamp: () => null,
    getWebSockets: () => [],
    id: aFakeDurableObjectId(),
    setHibernatableWebSocketEventTimeout: () => void 0,
    setWebSocketAutoResponse: () => void 0,
    waitUntil: () => void 0,
    facets: {
      get: vi.fn(),
      abort: () => void 0,
      delete: () => void 0,
    },
    ...opts,
  };
}
