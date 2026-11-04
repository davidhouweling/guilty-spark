import type { LiveTrackerMap } from "../../contracts/durable-objects/live-tracker/maps";
import { MAP_GENERATOR_COUNTS } from "../../contracts/individual-tracker/map-generation";
import { HISTORICAL_HCS_MAPS } from "../hcs";
import { MAP_CODE_MAPS, MAP_CODE_MODES } from "./codebook";

export class MapCodeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MapCodeError";
  }
}

function validateCount(count: number): void {
  if (!MAP_GENERATOR_COUNTS.includes(count)) {
    throw new MapCodeError(`Unsupported match count. Use ${MAP_GENERATOR_COUNTS.join(", ")} matches.`);
  }
}

function validatePair(modeCode: string, mapCode: string, matchNumber: number): LiveTrackerMap {
  const mode = MAP_CODE_MODES.get(modeCode);
  const map = MAP_CODE_MAPS.get(mapCode);
  if (mode == null) {
    throw new MapCodeError(`Match ${matchNumber.toString()}: unknown mode code "${modeCode}".`);
  }
  if (map == null) {
    throw new MapCodeError(`Match ${matchNumber.toString()}: unknown map code "${mapCode}".`);
  }
  if (!Object.entries(HISTORICAL_HCS_MAPS).some(([candidate, maps]) => candidate === mode && maps.includes(map))) {
    throw new MapCodeError(`Match ${matchNumber.toString()}: ${mode} on ${map} is not a supported combination.`);
  }
  return { mode, map };
}

function findCode(codebook: ReadonlyMap<string, string>, name: string, kind: string): string {
  for (const [code, value] of codebook) {
    if (value === name) {
      return code;
    }
  }
  throw new MapCodeError(`Unsupported ${kind} "${name}".`);
}

export function decodeMapCode(input: string): LiveTrackerMap[] {
  const code = input.trim();
  if (!/^[a-z]+$/i.test(code)) {
    throw new MapCodeError("A map code must contain only letters, without separators.");
  }
  if (code.length % 2 !== 0) {
    throw new MapCodeError("Each match needs two characters: a mode letter followed by a map letter.");
  }
  validateCount(code.length / 2);
  const normalizedCode = code.toUpperCase();
  const matches: LiveTrackerMap[] = [];
  for (let index = 0; index < normalizedCode.length; index += 2) {
    matches.push(validatePair(normalizedCode.charAt(index), normalizedCode.charAt(index + 1), index / 2 + 1));
  }
  return matches;
}

export function encodeMapCode(matches: readonly LiveTrackerMap[]): string {
  validateCount(matches.length);
  return matches
    .map((match, index) => {
      const modeCode = findCode(MAP_CODE_MODES, match.mode, "mode");
      const mapCode = findCode(MAP_CODE_MAPS, match.map, "map");
      validatePair(modeCode, mapCode, index + 1);
      return `${modeCode}${mapCode}`;
    })
    .join("");
}

export function encodeMapCodeIfSupported(matches: readonly LiveTrackerMap[]): string | undefined {
  try {
    return encodeMapCode(matches);
  } catch (error: unknown) {
    if (error instanceof MapCodeError) {
      return undefined;
    }
    throw error;
  }
}
