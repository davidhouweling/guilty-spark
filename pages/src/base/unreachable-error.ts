export class UnreachableError extends Error {
  constructor(value: never) {
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    super(`Unreachable code with specified value: ${value}`);
    this.name = "UnreachableError";
  }
}
