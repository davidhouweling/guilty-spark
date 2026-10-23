export interface TimedValue {
  readonly timestampMs: number;
}

export function interpolateSeriesAt<T extends TimedValue>(
  points: readonly T[],
  timestampMs: number,
  getValue: (point: T) => number,
): number | null {
  const first = points.at(0);
  const last = points.at(-1);
  if (first == null || last == null || timestampMs < first.timestampMs || timestampMs > last.timestampMs) {
    return null;
  }
  if (timestampMs === first.timestampMs) {
    return getValue(first);
  }
  let previous = first;
  for (let index = 1; index < points.length; index++) {
    const point = points[index];
    if (point.timestampMs >= timestampMs) {
      if (timestampMs === point.timestampMs) {
        return getValue(point);
      }
      const span = point.timestampMs - previous.timestampMs;
      return (
        getValue(previous) + ((getValue(point) - getValue(previous)) * (timestampMs - previous.timestampMs)) / span
      );
    }
    previous = point;
  }
  return getValue(last);
}
