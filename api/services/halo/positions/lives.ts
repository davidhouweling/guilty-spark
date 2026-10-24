import { groupBySlot } from "./group-by-slot";
import { isPresent } from "./roster";
import type { BipedLife, BipedPosition, DeathEvent, RosterMember } from "./types";

// a gap this long inside one slot opens a new life: far above the replication cadence and
// well below the respawn time
export const LIFE_GAP_MS = 5_000;
// the footer death clock and the packet clock share a base; the search covers residual drift
const DEATH_MATCH_WINDOW_MS = 150;
const OFFSET_SEARCH_MS = 2_000;
const OFFSET_STEP_MS = 10;

interface MutableLife {
  slot: number;
  startMs: number;
  endMs: number;
  samples: BipedPosition[];
  xuid: string | null;
}

export function buildLives(positions: readonly BipedPosition[]): BipedLife[] {
  const lives: MutableLife[] = [];
  for (const [slot, list] of groupBySlot(positions)) {
    let current: MutableLife | null = null;
    for (const position of list) {
      if (current == null || position.timestampMs - current.endMs > LIFE_GAP_MS) {
        current = { slot, startMs: position.timestampMs, endMs: position.timestampMs, samples: [], xuid: null };
        lives.push(current);
      }
      current.endMs = position.timestampMs;
      current.samples.push(position);
    }
  }
  return lives.map((life) => ({
    ...life,
    samples: life.samples.map((position) => ({ timestampMs: position.timestampMs, q: position.q })),
  }));
}

interface Pairing {
  readonly deathIndex: number;
  readonly lifeIndex: number;
}

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

// a death can end a life whose end falls inside the window; a life that began before its
// owner's previous death is impossible
function feasiblePairs(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  previousDeaths: PreviousDeaths,
  offsetMs: number,
): Pairing[] {
  const pairs: Pairing[] = [];
  for (const [deathIndex, death] of deaths.entries()) {
    const target = death.timestampMs + offsetMs;
    const previousDeath = previousDeaths[deathIndex] ?? null;
    for (const [lifeIndex, life] of lives.entries()) {
      const startsAfterPreviousDeath = previousDeath == null || life.startMs > previousDeath + offsetMs;
      if (Math.abs(life.endMs - target) <= DEATH_MATCH_WINDOW_MS && startsAfterPreviousDeath) {
        pairs.push({ deathIndex, lifeIndex });
      }
    }
  }
  return pairs;
}

function countBy(pairs: readonly Pairing[], key: (pair: Pairing) => number): Map<number, number> {
  const counts = new Map<number, number>();
  for (const pair of pairs) {
    counts.set(key(pair), (counts.get(key(pair)) ?? 0) + 1);
  }
  return counts;
}

// a pair is forced when one side has no other option and the other side is nobody else's
// only option; a death whose only life is also another death's only life stays open
function forcedPairs(open: readonly Pairing[]): Pairing[] {
  const deathOptions = countBy(open, (pair) => pair.deathIndex);
  const lifeOptions = countBy(open, (pair) => pair.lifeIndex);
  const soleLifeClaims = countBy(
    open.filter((pair) => deathOptions.get(pair.deathIndex) === 1),
    (pair) => pair.lifeIndex,
  );
  const soleDeathClaims = countBy(
    open.filter((pair) => lifeOptions.get(pair.lifeIndex) === 1),
    (pair) => pair.deathIndex,
  );
  return open.filter(
    (pair) =>
      (deathOptions.get(pair.deathIndex) === 1 && soleLifeClaims.get(pair.lifeIndex) === 1) ||
      (lifeOptions.get(pair.lifeIndex) === 1 && soleDeathClaims.get(pair.deathIndex) === 1),
  );
}

// two deaths at the same instant end two lives at the same instant, and the few milliseconds
// between their last samples carry no information, so pairs are only settled when forced;
// settling one pair can force the next, and whatever stays open is left to the later passes
function pairDeathsToLives(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  previousDeaths: PreviousDeaths,
  offsetMs: number,
): Pairing[] {
  let open = feasiblePairs(lives, deaths, previousDeaths, offsetMs);
  const settled: Pairing[] = [];
  let forced = forcedPairs(open);
  while (forced.length > 0) {
    settled.push(...forced);
    const usedDeaths = new Set(forced.map((pair) => pair.deathIndex));
    const usedLives = new Set(forced.map((pair) => pair.lifeIndex));
    open = open.filter((pair) => !usedDeaths.has(pair.deathIndex) && !usedLives.has(pair.lifeIndex));
    forced = forcedPairs(open);
  }
  return settled;
}

// the match count is a plateau across the acceptance window, so the plateau's centre is kept
export function bestDeathOffset(lives: readonly BipedLife[], deaths: readonly DeathEvent[]): number {
  const previousDeaths = previousDeathByIndex(deaths);
  let bestCount = -1;
  let plateau: number[] = [];
  for (let offset = -OFFSET_SEARCH_MS; offset <= OFFSET_SEARCH_MS; offset += OFFSET_STEP_MS) {
    const count = pairDeathsToLives(lives, deaths, previousDeaths, offset).length;
    if (count > bestCount) {
      bestCount = count;
      plateau = [offset];
    } else if (count === bestCount) {
      plateau.push(offset);
    }
  }
  return plateau[Math.floor(plateau.length / 2)] ?? 0;
}

export function nameLivesByDeaths(lives: readonly BipedLife[], deaths: readonly DeathEvent[]): BipedLife[] {
  if (deaths.length === 0 || lives.length === 0) {
    return [...lives];
  }
  const offsetMs = bestDeathOffset(lives, deaths);
  const named = lives.map((life) => ({ ...life }));
  for (const pairing of pairDeathsToLives(lives, deaths, previousDeathByIndex(deaths), offsetMs)) {
    const life = named[pairing.lifeIndex];
    const death = deaths[pairing.deathIndex];
    if (life != null && death != null) {
      named[pairing.lifeIndex] = { ...life, xuid: death.xuid };
    }
  }
  return named;
}

function slotOwners(lives: readonly BipedLife[]): Map<number, Set<string>> {
  const owners = new Map<number, Set<string>>();
  for (const life of lives) {
    if (life.xuid != null) {
      const set = owners.get(life.slot) ?? new Set<string>();
      set.add(life.xuid);
      owners.set(life.slot, set);
    }
  }
  return owners;
}

// a slot keeps its owner for the whole film (LevelUp measured no slot changing hands), so the
// one name a slot's lives agree on extends to the slot's unnamed lives
export function nameLivesBySlot(lives: readonly BipedLife[]): BipedLife[] {
  const owners = slotOwners(lives);
  return lives.map((life) => {
    const set = owners.get(life.slot);
    const [owner] = set ?? [];
    return life.xuid == null && set?.size === 1 && owner != null ? { ...life, xuid: owner } : life;
  });
}

const ELIMINATION_STEP_MS = 500;

function soleMissingPlayer(lives: readonly BipedLife[], roster: readonly RosterMember[], atMs: number): string | null {
  const alive = new Set(
    lives.filter((life) => life.xuid != null && life.startMs <= atMs && life.endMs >= atMs).map((life) => life.xuid),
  );
  const missing = roster.filter((member) => isPresent(member, atMs) && !alive.has(member.xuid));
  const [only] = missing;
  return missing.length === 1 && only != null ? only.xuid : null;
}

// a dead player has no life at all for a few seconds, so single instants are unreliable; the
// life is sampled along its span and named only when every decisive instant agrees
function eliminatedOwner(lives: readonly BipedLife[], roster: readonly RosterMember[], life: BipedLife): string | null {
  const owners = new Set<string>();
  for (let atMs = life.startMs; atMs <= life.endMs; atMs += ELIMINATION_STEP_MS) {
    const owner = soleMissingPlayer(lives, roster, atMs);
    if (owner != null) {
      owners.add(owner);
    }
  }
  const [only] = owners;
  return owners.size === 1 && only != null ? only : null;
}

// every present player has exactly one live biped at any instant, so an unnamed life whose span
// leaves exactly one roster member unaccounted for belongs to that member; naming one life can
// settle the next, so the pass repeats until nothing changes
export function nameLivesByElimination(lives: readonly BipedLife[], roster: readonly RosterMember[]): BipedLife[] {
  const named = [...lives];
  let changed = true;
  while (changed) {
    changed = false;
    for (const [index, life] of named.entries()) {
      if (life.xuid != null) {
        continue;
      }
      const owner = eliminatedOwner(named, roster, life);
      if (owner != null) {
        named[index] = { ...life, xuid: owner };
        changed = true;
      }
    }
  }
  return named;
}

// a player whose named life ended is dead until a biped appears for them again; the respawn
// delay is shared by every player in a match, so the longest-dead candidate respawns first
const MIN_RESPAWN_MS = 1_000;
const MAX_RESPAWN_MS = 30_000;

function lastDeathBefore(lives: readonly BipedLife[], xuid: string, atMs: number): number | null {
  let lastEnd: number | null = null;
  for (const life of lives) {
    if (life.xuid !== xuid) {
      continue;
    }
    if (life.startMs <= atMs && life.endMs >= atMs) {
      return null;
    }
    if (life.endMs < atMs && (lastEnd == null || life.endMs > lastEnd)) {
      lastEnd = life.endMs;
    }
  }
  return lastEnd;
}

function overlapsNamedLife(lives: readonly BipedLife[], xuid: string, life: BipedLife): boolean {
  return lives.some((other) => other.xuid === xuid && other.startMs <= life.endMs && other.endMs >= life.startMs);
}

function respawnWait(lives: readonly BipedLife[], member: RosterMember, life: BipedLife): number | null {
  if (!isPresent(member, life.startMs) || overlapsNamedLife(lives, member.xuid, life)) {
    return null;
  }
  const lastEnd = lastDeathBefore(lives, member.xuid, life.startMs);
  if (lastEnd == null) {
    return null;
  }
  const wait = life.startMs - lastEnd;
  return wait >= MIN_RESPAWN_MS && wait <= MAX_RESPAWN_MS ? wait : null;
}

// two players dead for exactly as long cannot be told apart, so neither is named
function longestWaitingPlayer(
  lives: readonly BipedLife[],
  roster: readonly RosterMember[],
  life: BipedLife,
): string | null {
  const waits = roster
    .map((member) => ({ xuid: member.xuid, wait: respawnWait(lives, member, life) }))
    .filter((entry): entry is { xuid: string; wait: number } => entry.wait != null)
    .sort((a, b) => b.wait - a.wait);
  const [longest, runnerUp] = waits;
  if (longest == null || runnerUp?.wait === longest.wait) {
    return null;
  }
  return longest.xuid;
}

// lives in a slot that already has an owner are left to the slot pass
export function nameLivesByRespawnOrder(lives: readonly BipedLife[], roster: readonly RosterMember[]): BipedLife[] {
  const named = [...lives];
  const ownedSlots = new Set(slotOwners(lives).keys());
  const order = [...named.keys()].sort((a, b) => (named[a]?.startMs ?? 0) - (named[b]?.startMs ?? 0));
  for (const index of order) {
    const life = named[index];
    if (life == null || life.xuid != null || ownedSlots.has(life.slot)) {
      continue;
    }
    const owner = longestWaitingPlayer(named, roster, life);
    if (owner != null) {
      named[index] = { ...life, xuid: owner };
    }
  }
  return named;
}
