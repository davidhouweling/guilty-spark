export interface TimedValue {
  readonly timestampMs: number;
}

// linear interpolation along a time-ordered polyline; null when the timestamp lies outside it
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
  let previous = first;
  for (const point of points.slice(1)) {
    if (point.timestampMs >= timestampMs) {
      const span = point.timestampMs - previous.timestampMs;
      if (span === 0 || timestampMs === point.timestampMs) {
        return getValue(point);
      }
      return (
        getValue(previous) + ((getValue(point) - getValue(previous)) * (timestampMs - previous.timestampMs)) / span
      );
    }
    previous = point;
  }
  // only a single-point series reaches here, with the timestamp on that point
  return getValue(first);
}
