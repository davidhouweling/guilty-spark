const MAX_COMPARE_PLAYERS = 8;
const MIN_COMPARE_PLAYERS = 1;

export function cleanCompareGamertags(rawGamertags: readonly string[]): string[] {
  return rawGamertags.map((gamertag) => gamertag.trim()).filter((gamertag) => gamertag !== "");
}

export function parseCompareGamertags(rawGamertags: readonly string[]): string[] {
  const cleanGamertags = cleanCompareGamertags(rawGamertags);
  const gamertagKeys = new Set<string>();
  const uniqueGamertags: string[] = [];
  for (const gamertag of cleanGamertags) {
    const gamertagKey = gamertag.toLowerCase();
    if (gamertagKeys.has(gamertagKey)) {
      continue;
    }

    gamertagKeys.add(gamertagKey);
    uniqueGamertags.push(gamertag);
  }

  if (uniqueGamertags.length < MIN_COMPARE_PLAYERS || uniqueGamertags.length > MAX_COMPARE_PLAYERS) {
    throw new Error("Provide 1 to 8 gamertags to compare.");
  }

  return uniqueGamertags;
}
