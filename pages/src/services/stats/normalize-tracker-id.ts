export function normalizeTrackerId(trackerId: string | undefined): string | undefined {
  if (trackerId == null) {
    return undefined;
  }

  const normalizedTrackerId = trackerId.trim();
  if (normalizedTrackerId.length === 0) {
    return undefined;
  }

  return normalizedTrackerId;
}
