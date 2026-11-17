export class HaloRequestExecutor {
  private tail: Promise<void> = Promise.resolve();

  public async execute<T>(request: () => Promise<T>, signal?: AbortSignal | null): Promise<T> {
    signal?.throwIfAborted();
    const { promise: aborted, reject } = Promise.withResolvers<never>();
    const onAbort = (): void => {
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    const result = this.tail.then(async () => {
      signal?.removeEventListener("abort", onAbort);
      signal?.throwIfAborted();
      return await request();
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await Promise.race([result, aborted]);
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }
  }
}
