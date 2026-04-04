export class UnreachableError extends Error {
  constructor(value: never) {
    super(`Unreachable value supplied: ${JSON.stringify(value)}`);
    this.name = "UnreachableError";
  }
}
