import type { BipedLife, BipedPosition, DeathEvent } from "./types";

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
  const bySlot = new Map<number, BipedPosition[]>();
  for (const position of positions) {
    const list = bySlot.get(position.slot) ?? [];
    list.push(position);
    bySlot.set(position.slot, list);
  }
  const lives: MutableLife[] = [];
  for (const [slot, list] of [...bySlot.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.timestampMs - b.timestampMs);
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
  readonly delta: number;
}

function previousDeathByIndex(deaths: readonly DeathEvent[]): (number | null)[] {
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

// two deaths at the same instant end two lives at the same instant, so timing alone cannot
// tell them apart; a life that began before its owner's previous death is impossible, which
// settles it. Greedy by increasing delta, so the result does not depend on iteration order.
function pairDeathsToLives(lives: readonly BipedLife[], deaths: readonly DeathEvent[], offsetMs: number): Pairing[] {
  const previousDeaths = previousDeathByIndex(deaths);
  const candidates: Pairing[] = [];
  for (const [deathIndex, death] of deaths.entries()) {
    const target = death.timestampMs + offsetMs;
    const previousDeath = previousDeaths[deathIndex] ?? null;
    for (const [lifeIndex, life] of lives.entries()) {
      const delta = Math.abs(life.endMs - target);
      const startsAfterPreviousDeath = previousDeath == null || life.startMs > previousDeath + offsetMs;
      if (delta <= DEATH_MATCH_WINDOW_MS && startsAfterPreviousDeath) {
        candidates.push({ deathIndex, lifeIndex, delta });
      }
    }
  }
  candidates.sort((a, b) => a.delta - b.delta || a.lifeIndex - b.lifeIndex);
  const usedDeaths = new Set<number>();
  const usedLives = new Set<number>();
  const pairings: Pairing[] = [];
  for (const candidate of candidates) {
    if (usedDeaths.has(candidate.deathIndex) || usedLives.has(candidate.lifeIndex)) {
      continue;
    }
    usedDeaths.add(candidate.deathIndex);
    usedLives.add(candidate.lifeIndex);
    pairings.push(candidate);
  }
  return pairings;
}

// the match count is a plateau across the acceptance window, so the plateau's centre is kept
export function bestDeathOffset(lives: readonly BipedLife[], deaths: readonly DeathEvent[]): number {
  let bestCount = -1;
  let plateau: number[] = [];
  for (let offset = -OFFSET_SEARCH_MS; offset <= OFFSET_SEARCH_MS; offset += OFFSET_STEP_MS) {
    const count = pairDeathsToLives(lives, deaths, offset).length;
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
  for (const pairing of pairDeathsToLives(lives, deaths, offsetMs)) {
    const life = named[pairing.lifeIndex];
    const death = deaths[pairing.deathIndex];
    if (life != null && death != null) {
      named[pairing.lifeIndex] = { ...life, xuid: death.xuid };
    }
  }
  return named;
}

const ELIMINATION_STEP_MS = 500;

function soleMissingPlayer(lives: readonly BipedLife[], roster: readonly string[], atMs: number): string | null {
  const alive = new Set(
    lives.filter((life) => life.xuid != null && life.startMs <= atMs && life.endMs >= atMs).map((life) => life.xuid),
  );
  const missing = roster.filter((xuid) => !alive.has(xuid));
  const [only] = missing;
  return missing.length === 1 && only != null ? only : null;
}

// a dead player has no life at all for a few seconds, so single instants are unreliable; the
// life is sampled along its span and named only when every decisive instant agrees
function eliminatedOwner(lives: readonly BipedLife[], roster: readonly string[], life: BipedLife): string | null {
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

// every player has exactly one live biped at any instant, so an unnamed life whose span leaves
// exactly one roster member unaccounted for belongs to that member; naming one life can settle
// the next, so the pass repeats until nothing changes
export function nameLivesByElimination(lives: readonly BipedLife[], roster: readonly string[]): BipedLife[] {
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

function longestWaitingPlayer(lives: readonly BipedLife[], roster: readonly string[], life: BipedLife): string | null {
  let owner: string | null = null;
  let longestWait = 0;
  for (const xuid of roster) {
    const lastEnd = lastDeathBefore(lives, xuid, life.startMs);
    if (lastEnd == null || overlapsNamedLife(lives, xuid, life)) {
      continue;
    }
    const wait = life.startMs - lastEnd;
    if (wait >= MIN_RESPAWN_MS && wait <= MAX_RESPAWN_MS && wait > longestWait) {
      owner = xuid;
      longestWait = wait;
    }
  }
  return owner;
}

export function nameLivesByRespawnOrder(lives: readonly BipedLife[], roster: readonly string[]): BipedLife[] {
  const named = [...lives];
  const order = [...named.keys()].sort((a, b) => (named[a]?.startMs ?? 0) - (named[b]?.startMs ?? 0));
  for (const index of order) {
    const life = named[index];
    if (life == null || life.xuid != null) {
      continue;
    }
    const owner = longestWaitingPlayer(named, roster, life);
    if (owner != null) {
      named[index] = { ...life, xuid: owner };
    }
  }
  return named;
}
