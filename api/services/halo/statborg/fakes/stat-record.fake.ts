import type { StatRecord, StatValue } from "../types";

export function aFakeStatRecordWith(
  overrides: Partial<Omit<StatRecord, "components">> & { components?: Record<number, StatValue> } = {},
): StatRecord {
  const { components, ...rest } = overrides;
  return {
    timestampMs: 1000,
    slot: 10,
    components: new Map(
      Object.entries(components ?? { 2: { a: 1, b: 0 } }).map(([index, value]) => [Number(index), value]),
    ),
    ...rest,
  };
}
