import { DEATH_MATCH_WINDOW_MS, MIN_RESPAWN_MS } from "./naming-constants";
import { PRESENCE_TOLERANCE_MS } from "./roster";
import type { BipedLife, DeathAlignment, DeathEvent, DeathLifePairing, RosterMember } from "./types";

const OFFSET_SEARCH_MS = 2_000;
const OFFSET_STEP_MS = 10;

type PreviousDeaths = readonly (number | null)[];

function previousDeathByIndex(deaths: readonly DeathEvent[]): PreviousDeaths {
  const lastSeen = new Map<string, number>();
  const previous: (number | null)[] = [];
  const order = [...deaths.keys()].sort(
    (a, b) => (deaths[a]?.timestampMs ?? 0) - (deaths[b]?.timestampMs ?? 0) || a - b,
  );
  for (const index of order) {
    const death = deaths[index];
    if (death == null) {
      continue;
    }
    previous[index] = lastSeen.get(death.xuid) ?? null;
    lastSeen.set(death.xuid, death.timestampMs);
  }
  return previous;
}

// slack values are measured on the match clock, so the offset moves them like the deaths
interface NearbyPair extends DeathLifePairing {
  readonly delta: number;
  readonly startGap: number | null;
  readonly joinSlackMs: number;
  readonly leaveSlackMs: number;
}

function nearbyPairs(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  previousDeaths: PreviousDeaths,
  roster: readonly RosterMember[],
): NearbyPair[] {
  const reach = OFFSET_SEARCH_MS + DEATH_MATCH_WINDOW_MS;
  const pairs: NearbyPair[] = [];
  for (const [deathIndex, death] of deaths.entries()) {
    const member = roster.find((candidate) => candidate.xuid === death.xuid);
    const previousDeath = previousDeaths[deathIndex] ?? null;
    if (member == null) {
      continue;
    }
    for (const [lifeIndex, life] of lives.entries()) {
      const delta = life.endMs - death.timestampMs;
      if (Math.abs(delta) <= reach) {
        pairs.push({
          deathIndex,
          lifeIndex,
          delta,
          startGap: previousDeath == null ? null : life.startMs - previousDeath,
          joinSlackMs: life.startMs - member.presentFromMs,
          leaveSlackMs: member.presentToMs - life.endMs,
        });
      }
    }
  }
  return pairs;
}

// a death can end a life whose end falls inside the window, as long as its player may have
// been present for the whole life and had respawned since their previous death
function isFeasible(pair: NearbyPair, offsetMs: number): boolean {
  return (
    Math.abs(pair.delta - offsetMs) <= DEATH_MATCH_WINDOW_MS &&
    (pair.startGap == null || pair.startGap - offsetMs >= MIN_RESPAWN_MS) &&
    pair.joinSlackMs - offsetMs >= -PRESENCE_TOLERANCE_MS &&
    pair.leaveSlackMs + offsetMs >= -PRESENCE_TOLERANCE_MS
  );
}

function feasiblePairs(pairs: readonly NearbyPair[], offsetMs: number): DeathLifePairing[] {
  return pairs
    .filter((pair) => isFeasible(pair, offsetMs))
    .map(({ deathIndex, lifeIndex }) => ({ deathIndex, lifeIndex }));
}

// a pair is forced when one side has no other option and the other side is nobody else's
// only option; a death whose only life is also another death's only life stays open
interface PairComponent {
  readonly deaths: number[];
  readonly pairs: DeathLifePairing[];
}

// deaths linked through shared candidate lives form one component; a settlement in one
// component never depends on another
function pairComponents(open: readonly DeathLifePairing[]): PairComponent[] {
  const parent = new Map<number, number>();
  const find = (death: number): number => {
    const root = parent.get(death) ?? death;
    if (root === death) {
      return death;
    }
    const top = find(root);
    parent.set(death, top);
    return top;
  };
  const deathsByLife = new Map<number, number[]>();
  for (const pair of open) {
    deathsByLife.set(pair.lifeIndex, [...(deathsByLife.get(pair.lifeIndex) ?? []), pair.deathIndex]);
  }
  for (const deaths of deathsByLife.values()) {
    const [first, ...rest] = deaths;
    for (const death of rest) {
      if (first != null) {
        parent.set(find(death), find(first));
      }
    }
  }
  const components = new Map<number, PairComponent>();
  for (const pair of open) {
    const root = find(pair.deathIndex);
    const component = components.get(root) ?? { deaths: [], pairs: [] };
    if (!component.deaths.includes(pair.deathIndex)) {
      component.deaths.push(pair.deathIndex);
    }
    component.pairs.push(pair);
    components.set(root, component);
  }
  return [...components.values()];
}

const MAX_COMPONENT_PAIRS = 24;

// every maximum matching of the component is enumerated; the deaths are tried in order and
// each may take any free candidate life or stay unmatched
function maximumMatchings(component: PairComponent): DeathLifePairing[][] {
  const matchings: DeathLifePairing[][] = [];
  let best = 0;
  const visit = (deathPosition: number, usedLives: Set<number>, chosen: DeathLifePairing[]): void => {
    if (deathPosition === component.deaths.length) {
      if (chosen.length > best) {
        best = chosen.length;
        matchings.length = 0;
      }
      if (chosen.length === best) {
        matchings.push([...chosen]);
      }
      return;
    }
    const death = component.deaths[deathPosition];
    for (const pair of component.pairs) {
      if (pair.deathIndex === death && !usedLives.has(pair.lifeIndex)) {
        usedLives.add(pair.lifeIndex);
        chosen.push(pair);
        visit(deathPosition + 1, usedLives, chosen);
        chosen.pop();
        usedLives.delete(pair.lifeIndex);
      }
    }
    visit(deathPosition + 1, usedLives, chosen);
  };
  visit(0, new Set(), []);
  return matchings;
}

function pairsInEveryMaximumMatching(component: PairComponent): DeathLifePairing[] {
  if (component.pairs.length > MAX_COMPONENT_PAIRS) {
    return [];
  }
  const matchings = maximumMatchings(component);
  const [first] = matchings;
  if (first == null) {
    return [];
  }
  return first.filter((pair) =>
    matchings.every((matching) =>
      matching.some((other) => other.deathIndex === pair.deathIndex && other.lifeIndex === pair.lifeIndex),
    ),
  );
}

// two deaths at the same instant end two lives at the same instant, and the few milliseconds
// between their last samples carry no information, so a pair is settled only when every
// maximum matching of its component contains it; whatever stays open is left to later passes
function pairDeathsToLives(pairs: readonly NearbyPair[], offsetMs: number): DeathLifePairing[] {
  return pairComponents(feasiblePairs(pairs, offsetMs)).flatMap(pairsInEveryMaximumMatching);
}

// an augmenting-path search gives the size of the largest one-to-one matching, so a death
// beside a cluster of lives counts once and a near miss never shadows a feasible pair
function maximumMatchingSize(pairs: readonly DeathLifePairing[]): number {
  const livesByDeath = new Map<number, number[]>();
  for (const pair of pairs) {
    livesByDeath.set(pair.deathIndex, [...(livesByDeath.get(pair.deathIndex) ?? []), pair.lifeIndex]);
  }
  const deathByLife = new Map<number, number>();
  const augment = (death: number, visited: Set<number>): boolean => {
    for (const life of livesByDeath.get(death) ?? []) {
      if (visited.has(life)) {
        continue;
      }
      visited.add(life);
      const holder = deathByLife.get(life);
      if (holder == null || augment(holder, visited)) {
        deathByLife.set(life, death);
        return true;
      }
    }
    return false;
  };
  let size = 0;
  for (const death of livesByDeath.keys()) {
    if (augment(death, new Set())) {
      size += 1;
    }
  }
  return size;
}

function matchedCount(pairs: readonly NearbyPair[], offsetMs: number): number {
  return maximumMatchingSize(feasiblePairs(pairs, offsetMs));
}

// the plateau's centre is kept: at its edge every pairing delta would be the half-window
function isContiguous(offsets: readonly number[]): boolean {
  return offsets.every((offset, index) => index === 0 || offset - (offsets[index - 1] ?? offset) === OFFSET_STEP_MS);
}

// two separate plateaus with the same count mean the feed supports two different clocks, so
// no alignment is claimed
function optimalOffsets(pairs: readonly NearbyPair[]): number[] {
  let bestCount = -1;
  let plateau: number[] = [];
  for (let offset = -OFFSET_SEARCH_MS; offset <= OFFSET_SEARCH_MS; offset += OFFSET_STEP_MS) {
    const count = matchedCount(pairs, offset);
    if (count > bestCount) {
      bestCount = count;
      plateau = [offset];
    } else if (count === bestCount) {
      plateau.push(offset);
    }
  }
  return bestCount > 0 && isContiguous(plateau) ? plateau : [];
}

function pairingKey(pair: DeathLifePairing): string {
  return `${String(pair.deathIndex)}|${String(pair.lifeIndex)}`;
}

// the clock is only known to the width of the plateau, so a pairing counts only if it is
// settled at every offset on it
function pairingsSettledAcrossPlateau(pairs: readonly NearbyPair[], plateau: readonly number[]): DeathLifePairing[] {
  const [first, ...rest] = plateau;
  if (first == null) {
    return [];
  }
  const settled = pairDeathsToLives(pairs, first);
  const survivors = rest.reduce(
    (keys, offset) => {
      const atOffset = new Set(pairDeathsToLives(pairs, offset).map(pairingKey));
      return new Set([...keys].filter((key) => atOffset.has(key)));
    },
    new Set(settled.map(pairingKey)),
  );
  return settled.filter((pair) => survivors.has(pairingKey(pair)));
}

export function alignDeathsToFilm(deaths: readonly DeathEvent[], offsetMs: number): DeathEvent[] {
  return deaths.map((death) => ({ ...death, timestampMs: death.timestampMs + offsetMs }));
}

// the feed's clock offset against the film is the centre of the optimal plateau; the pairings
// are the death-to-life settlements that hold at every offset on it
export function measureDeathAlignment(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  roster: readonly RosterMember[],
): DeathAlignment {
  const pairs = nearbyPairs(lives, deaths, previousDeathByIndex(deaths), roster);
  const plateau = optimalOffsets(pairs);
  return {
    offsetMs: plateau[Math.floor(plateau.length / 2)] ?? null,
    pairings: pairingsSettledAcrossPlateau(pairs, plateau),
  };
}
