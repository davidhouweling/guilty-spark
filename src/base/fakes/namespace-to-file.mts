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

export class FileBackedKVNamespace implements KVNamespace<string> {
  private store: Map<string, string>;
  private filePath: string;
  private isWriting: boolean = false;
  private writeQueue: (() => void)[] = [];

  constructor(filePath: string) {
    this.filePath = filePath;
    this.store = new Map();
  }

  async init() {
    try {
      const data = await fs.readFile(this.filePath, "utf-8");
      const obj = JSON.parse(data);
      for (const [key, value] of Object.entries(obj)) {
        this.store.set(key, value as string);
      }
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
      await this.persist();
    }
  }

  private async persist() {
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
      this.isWriting = false;
      if (this.writeQueue.length > 0) {
        const next = this.writeQueue.shift();
        if (next) {
          next();
        }
      }
    }
  }

  // --- get overloads (matching interface) ---
  get(key: string, options?: Partial<KVNamespaceGetOptions<undefined>>): Promise<string | null>;
  get(key: string, type: "text"): Promise<string | null>;
  get<ExpectedValue = unknown>(key: string, type: "json"): Promise<ExpectedValue | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  get(key: string, type: "stream"): Promise<ReadableStream | null>;
  get(key: string, options?: KVNamespaceGetOptions<"text">): Promise<string | null>;
  get<ExpectedValue = unknown>(key: string, options?: KVNamespaceGetOptions<"json">): Promise<ExpectedValue | null>;
  get(key: string, options?: KVNamespaceGetOptions<"arrayBuffer">): Promise<ArrayBuffer | null>;
  get(key: string, options?: KVNamespaceGetOptions<"stream">): Promise<ReadableStream | null>;
  get(key: string[], type: "text"): Promise<Map<string, string | null>>;
  get<ExpectedValue = unknown>(key: string[], type: "json"): Promise<Map<string, ExpectedValue | null>>;
  get(key: string[], options?: Partial<KVNamespaceGetOptions<undefined>>): Promise<Map<string, string | null>>;
  get(key: string[], options?: KVNamespaceGetOptions<"text">): Promise<Map<string, string | null>>;
  get<ExpectedValue = unknown>(
    key: string[],
    options?: KVNamespaceGetOptions<"json">,
  ): Promise<Map<string, ExpectedValue | null>>;
  async get(key: string | string[], typeOrOptions?: any): Promise<any> {
    if (Array.isArray(key)) {
      const result = new Map();
      for (const k of key) {
        result.set(k, await this.get(k, typeOrOptions));
      }
      return result;
    }

    if (!this.store.has(key)) {
      return null;
    }

    const value = this.store.get(key)!;
    const type = typeof typeOrOptions === "string" ? typeOrOptions : typeOrOptions?.type;
    switch (type) {
      case undefined:
      case "text": {
        return value;
      }
      case "json": {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      }
      case "arrayBuffer": {
        return Buffer.from(value);
      }
      case "stream": {
        const { Readable } = await import("stream");
        return Readable.from([value]);
      }
      default: {
        return value;
      }
    }
  }

  // --- put ---
  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    _options?: unknown,
  ): Promise<void> {
    let strValue: string;
    if (typeof value === "string") {
      strValue = value;
    } else if (value instanceof ArrayBuffer) {
      strValue = Buffer.from(value).toString();
    } else if (ArrayBuffer.isView(value)) {
      strValue = Buffer.from(value.buffer).toString();
    } else {
      // ReadableStream not supported in Node.js by default
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
  }): Promise<KVNamespaceListResult<Metadata, string>> {
    let keys = Array.from(this.store.keys());
    if (options?.prefix) {
      keys = keys.filter((k) => k.startsWith(options.prefix!));
    }
    const result: KVNamespaceListKey<Metadata, string>[] = keys.map((name) => ({ name }));
    return {
      list_complete: true,
      keys: result,
      cacheStatus: null,
    };
  }

  // --- getWithMetadata overloads (matching interface) ---
  getWithMetadata<Metadata = unknown>(
    key: string,
    options?: Partial<KVNamespaceGetOptions<undefined>>,
  ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: "text",
  ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string,
    type: "json",
  ): Promise<KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: "arrayBuffer",
  ): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    type: "stream",
  ): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: KVNamespaceGetOptions<"text">,
  ): Promise<KVNamespaceGetWithMetadataResult<string, Metadata>>;
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string,
    options: KVNamespaceGetOptions<"json">,
  ): Promise<KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: KVNamespaceGetOptions<"arrayBuffer">,
  ): Promise<KVNamespaceGetWithMetadataResult<ArrayBuffer, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string,
    options: KVNamespaceGetOptions<"stream">,
  ): Promise<KVNamespaceGetWithMetadataResult<ReadableStream, Metadata>>;
  getWithMetadata<Metadata = unknown>(
    key: string[],
    type: "text",
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string[],
    type: "json",
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>>;
  getWithMetadata<Metadata = unknown>(
    key: string[],
    options?: Partial<KVNamespaceGetOptions<undefined>>,
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
  getWithMetadata<Metadata = unknown>(
    key: string[],
    options?: KVNamespaceGetOptions<"text">,
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<string, Metadata>>>;
  getWithMetadata<ExpectedValue = unknown, Metadata = unknown>(
    key: string[],
    options?: KVNamespaceGetOptions<"json">,
  ): Promise<Map<string, KVNamespaceGetWithMetadataResult<ExpectedValue, Metadata>>>;
  async getWithMetadata(key: string | string[], typeOrOptions?: any): Promise<any> {
    if (Array.isArray(key)) {
      const result = new Map();
      for (const k of key) {
        result.set(k, await this.getWithMetadata(k, typeOrOptions));
      }
      return result;
    }
    const value = await this.get(key, typeOrOptions);
    return {
      value,
      metadata: null,
      cacheStatus: null,
    };
  }
}

export async function createFileBackedKVNamespace(filePath: string): Promise<KVNamespace<string>> {
  const kv = new FileBackedKVNamespace(filePath);
  await kv.init();
  return kv;
}
