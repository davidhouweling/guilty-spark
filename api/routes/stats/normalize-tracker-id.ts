export function normalizeTrackerId(rawTrackerId: string | null): string | undefined {
  if (rawTrackerId == null) {
    return undefined;
  }

  const normalizedTrackerId = rawTrackerId.trim();
  if (normalizedTrackerId.length === 0) {
    return undefined;
  }

  return normalizedTrackerId;
}
