const MAX_COMPARE_PLAYERS = 8;
const MIN_COMPARE_PLAYERS = 2;

export function cleanCompareGamertags(rawGamertags: readonly string[]): string[] {
  return rawGamertags
    .map((gamertag) => gamertag.trim())
    .filter((gamertag) => gamertag !== "");
}

export function parseCompareGamertags(rawGamertags: readonly string[]): string[] {
  const cleanGamertags = cleanCompareGamertags(rawGamertags);

  if (cleanGamertags.length < MIN_COMPARE_PLAYERS || cleanGamertags.length > MAX_COMPARE_PLAYERS) {
    throw new Error("Provide 2 to 8 gamertags to compare.");
  }

  const uniqueGamertags: string[] = [];
  for (const gamertag of cleanGamertags) {
    if (!uniqueGamertags.includes(gamertag)) {
      uniqueGamertags.push(gamertag);
    }
  }

  if (uniqueGamertags.length < MIN_COMPARE_PLAYERS || uniqueGamertags.length > MAX_COMPARE_PLAYERS) {
    throw new Error("Provide 2 to 8 gamertags to compare.");
  }

  return uniqueGamertags;
}
