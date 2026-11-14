export class HaloRequestExecutor {
  private tail: Promise<void> = Promise.resolve();

  public async execute<T>(request: () => Promise<T>): Promise<T> {
    const result = this.tail.then(request);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return await result;
  }
}
