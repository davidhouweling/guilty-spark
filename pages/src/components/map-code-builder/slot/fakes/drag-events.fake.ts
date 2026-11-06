export class FakeDataTransfer implements Pick<
  DataTransfer,
  "types" | "effectAllowed" | "dropEffect" | "getData" | "setData"
> {
  private readonly data = new Map<string, string>();
  public effectAllowed: DataTransfer["effectAllowed"] = "none";
  public dropEffect: DataTransfer["dropEffect"] = "none";
  public get types(): string[] {
    return [...this.data.keys()];
  }
  public setData(format: string, value: string): void {
    this.data.set(format, value);
  }
  public getData(format: string): string {
    return this.data.get(format) ?? "";
  }
}

export class FakePointerEvent extends MouseEvent {
  public readonly pointerId: number;
  public constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}
