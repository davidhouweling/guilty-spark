import { Preconditions } from "../../base/preconditions.mjs";
import type { MapMode } from "./hcs.mjs";

export interface RoundRobinArgs {
  count: number;
  pool: { mode: MapMode; map: string }[];
  formatSequence: ("slayer" | "objective")[];
}

export type generateRoundRobinMapsFn = (args: RoundRobinArgs) => { mode: MapMode; map: string }[];

export const generateRoundRobinMaps: generateRoundRobinMapsFn = ({ count, pool, formatSequence }) => {
  const available: { mode: MapMode; map: string }[] = [...pool];

  // Shuffle pool for randomness
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp: { mode: MapMode; map: string } = Preconditions.checkExists(available[i]);
    available[i] = Preconditions.checkExists(available[j]);
    available[j] = temp;
  }

  const result: { mode: MapMode; map: string }[] = [];
  const used = new Set<string>();
  let poolIndex = 0;

  for (let i = 0; i < count; i++) {
    const type = formatSequence[i % formatSequence.length];
    let candidates: { mode: MapMode; map: string }[] =
      type === "slayer"
        ? available.filter(({ mode }) => mode === "Slayer")
        : available.filter(({ mode }) => mode !== "Slayer");

    candidates = candidates.filter(({ mode, map }) => !used.has(`${String(mode)}:${map}`));

    if (candidates.length === 0) {
      used.clear();
      candidates =
        type === "slayer"
          ? available.filter(({ mode }) => mode === "Slayer")
          : available.filter(({ mode }) => mode !== "Slayer");
    }

    const pick: { mode: MapMode; map: string } = Preconditions.checkExists(candidates[poolIndex % candidates.length]);
    result.push(pick);
    used.add(`${String(pick.mode)}:${pick.map}`);
    poolIndex++;
  }

  return result;
};
