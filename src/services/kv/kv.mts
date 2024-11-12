interface KvServiceOpts {
  env: Env;
}

export class KvService {
  private readonly env: Env;

  constructor({ env }: KvServiceOpts) {
    this.env = env;
  }

  get kv() {
    const kv = this.env[this.env.KV_NAMESPACE as keyof Env];
    if (!kv) {
      throw new Error(`KV namespace ${this.env.KV_NAMESPACE} not found`);
    }
    return kv as KVNamespace;
  }
}
