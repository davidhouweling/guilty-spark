export function zeroScores(teamIds: readonly number[]): Record<string, number> {
  return Object.fromEntries(teamIds.map((teamId) => [String(teamId), 0]));
}
