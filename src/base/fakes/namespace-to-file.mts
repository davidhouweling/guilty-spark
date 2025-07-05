import { promises as fs } from "fs";

// Helper types from worker-configuration.d.ts
interface KVNamespaceListKey<Metadata, Key extends string = string> {
  name: Key;
  expiration?: number;
  metadata?: Metadata;
}
type KVNamespaceListResult<Metadata, Key extends string = string> =
  | {
      list_complete: false;
      keys: KVNamespaceListKey<Metadata, Key>[];
      cursor: string;
      cacheStatus: string | null;
    }
  | {
      list_complete: true;
      keys: KVNamespaceListKey<Metadata, Key>[];
      cacheStatus: string | null;
    };
interface KVNamespaceGetWithMetadataResult<Value, Metadata> {
  value: Value | null;
  metadata: Metadata | null;
  cacheStatus: string | null;
}
interface KVNamespaceGetOptions<Type> {
  type: Type;
  cacheTtl?: number;
}

type GetType = "text" | "json" | "arrayBuffer" | "stream";
type GetOptions =
  | Partial<KVNamespaceGetOptions<undefined>>
  | KVNamespaceGetOptions<"text">
  | KVNamespaceGetOptions<"json">
  | KVNamespaceGetOptions<"arrayBuffer">
  | KVNamespaceGetOptions<"stream">;

type GetReturn<T> = T | null;
type GetWithMetadataReturn<T, M> = KVNamespaceGetWithMetadataResult<T, M>;

export class FileBackedKVNamespace implements KVNamespace {
  private readonly store: Map<string, string>;
  private readonly filePath: string;
  private isWriting = false;
  private readonly writeQueue: (() => void)[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
    this.store = new Map();
  }

  async init(): Promise<void> {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      const obj = JSON.parse(data) as Record<string, string>;
      Object.entries(obj).forEach(([key, value]) => {
        this.store.set(key, value);
      });
    } catch (e) {
      if (typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "ENOENT") {
        await this.persist();
      } else {
        throw e;
      }
    }
  }

  private async persist(): Promise<void> {
    const obj: Record<string, string> = {};
    for (const [key, value] of this.store.entries()) {
      obj[key] = value;
    }
    if (this.isWriting) {
      await new Promise<void>((resolve) => this.writeQueue.push(resolve));
    }
    this.isWriting = true;
    try {
      await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2), "utf-8");
    } finally {
      const next = this.writeQueue.shift();
      this.isWriting = false;
      if (next) next();
    }
  }

  // --- get overloads (unified signatures) ---
  get<ExpectedValue = unknown>(
    key: string,
    typeOrOptions?: GetType | GetOptions,
  ): Promise<GetReturn<string | ExpectedValue | ArrayBuffer | ReadableStream>>;
  get<ExpectedValue = unknown>(
    key: string[],
    typeOrOptions?: GetType | GetOptions,
  ): Promise<Map<string, GetReturn<string | ExpectedValue | ArrayBuffer | ReadableStream>>>;
  async get<ExpectedValue = unknown>(
    key: string | string[],
    typeOrOptions?: GetType | GetOptions,
  ): Promise<
    | GetReturn<string | ExpectedValue | ArrayBuffer | ReadableStream>
    | Map<string, GetReturn<string | ExpectedValue | ArrayBuffer | ReadableStream>>
  > {
    if (Array.isArray(key)) {
      const result = new Map<string, GetReturn<string | ExpectedValue | ArrayBuffer | ReadableStream>>();
      for (const k of key) {
        result.set(k, await this.get<ExpectedValue>(k, typeOrOptions));
      }
      return result;
    }
    if (!this.store.has(key)) {
      return null;
    }
    const value = this.store.get(key);
    const type =
      typeof typeOrOptions === "string"
        ? typeOrOptions
        : typeOrOptions && typeof typeOrOptions === "object"
          ? (typeOrOptions as { type?: string }).type
          : undefined;
    switch (type) {
      case undefined:
      case "text":
        return value ?? null;
      case "json":
        try {
          return (JSON.parse(value ?? "") as ExpectedValue) ?? null;
        } catch {
          return null;
        }
      case "arrayBuffer":
        if (typeof value === "string") {
          const buf = new TextEncoder().encode(value);
          return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
        }
        return null;
      case "stream": {
        if (typeof value === "string") {
          const { Readable } = await import("stream");
          // @ts-expect-error: Node.js Readable is not a web ReadableStream
          return Readable.from([value]);
        }
        return null;
      }
      default:
        return value ?? null;
    }
  }

  // --- put ---
  async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream): Promise<void> {
    let strValue: string;
    if (typeof value === "string") {
      strValue = value;
    } else if (value instanceof ArrayBuffer) {
      strValue = Buffer.from(value).toString();
    } else if (ArrayBuffer.isView(value)) {
      strValue = Buffer.from(value.buffer).toString();
    } else {
      throw new Error("ReadableStream not supported in this fake");
    }
    this.store.set(key, strValue);
    await this.persist();
  }

  // --- delete ---
  async delete(key: string): Promise<void> {
    this.store.delete(key);
    await this.persist();
  }

  // --- list ---
  async list<Metadata = unknown>(options?: {
    prefix?: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<KVNamespaceListResult<Metadata>> {
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await null;
    let keys = Array.from(this.store.keys());
    const { prefix } = options ?? {};
    if (typeof prefix === "string") {
      keys = keys.filter((k) => k.startsWith(prefix));
    }
    const result: KVNamespaceListKey<Metadata>[] = keys.map((name) => ({ name }));
    return {
      list_complete: true,
      keys: result,
      cacheStatus: null,
    };
  }

  // --- getWithMetadata overloads (unified signatures) ---
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string,
    typeOrOptions?: GetType | GetOptions,
  ): Promise<GetWithMetadataReturn<ExpectedValue, Metadata>>;
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string[],
    typeOrOptions?: GetType | GetOptions,
  ): Promise<Map<string, GetWithMetadataReturn<ExpectedValue, Metadata>>>;
  async getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string | string[],
    typeOrOptions?: GetType | GetOptions,
  ): Promise<
    GetWithMetadataReturn<ExpectedValue, Metadata> | Map<string, GetWithMetadataReturn<ExpectedValue, Metadata>>
  > {
    if (Array.isArray(key)) {
      const result = new Map<string, GetWithMetadataReturn<ExpectedValue, Metadata>>();
      for (const k of key) {
        result.set(k, await this.getWithMetadata<ExpectedValue, Metadata>(k, typeOrOptions));
      }
      return result;
    }
    const value = await this.get<ExpectedValue>(key, typeOrOptions);
    return {
      value: value as ExpectedValue | null,
      metadata: null,
      cacheStatus: null,
    };
  }
}

export async function createFileBackedKVNamespace(filePath: string): Promise<KVNamespace> {
  const kv = new FileBackedKVNamespace(filePath);
  await kv.init();
  return kv;
}
