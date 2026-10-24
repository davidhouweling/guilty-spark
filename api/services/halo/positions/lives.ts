import { byTimestamp, groupBySlot } from "./group-by-slot";
import { isPresent, mayBePresent } from "./roster";
import type { BipedLife, BipedPosition, DeathEvent, RosterMember } from "./types";

// a gap this long inside one slot opens a new life: far above the replication cadence and
// well below the respawn time
export const LIFE_GAP_MS = 5_000;
const MIN_RESPAWN_MS = 1_000;
const MAX_RESPAWN_MS = 30_000;
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
  for (const [slot, list] of groupBySlot(positions, byTimestamp)) {
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

interface NearbyPair extends Pairing {
  readonly delta: number;
  readonly startGap: number | null;
}

function nearbyPairs(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  previousDeaths: PreviousDeaths,
): NearbyPair[] {
  const reach = OFFSET_SEARCH_MS + DEATH_MATCH_WINDOW_MS;
  const pairs: NearbyPair[] = [];
  for (const [deathIndex, death] of deaths.entries()) {
    const previousDeath = previousDeaths[deathIndex] ?? null;
    for (const [lifeIndex, life] of lives.entries()) {
      const delta = life.endMs - death.timestampMs;
      if (Math.abs(delta) <= reach) {
        pairs.push({
          deathIndex,
          lifeIndex,
          delta,
          startGap: previousDeath == null ? null : life.startMs - previousDeath,
        });
      }
    }
  }
  return pairs;
}

// a death can end a life whose end falls inside the window; a life that began before its
// owner's previous death is impossible
function feasiblePairs(pairs: readonly NearbyPair[], offsetMs: number): Pairing[] {
  return pairs
    .filter((pair) => Math.abs(pair.delta - offsetMs) <= DEATH_MATCH_WINDOW_MS)
    .filter((pair) => pair.startGap == null || pair.startGap > offsetMs)
    .map(({ deathIndex, lifeIndex }) => ({ deathIndex, lifeIndex }));
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
function pairDeathsToLives(pairs: readonly NearbyPair[], offsetMs: number): Pairing[] {
  let open = feasiblePairs(pairs, offsetMs);
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

// each death and each life count once, so a death beside a cluster of lives cannot pull the
// offset towards the cluster
function matchedCount(pairs: readonly NearbyPair[], offsetMs: number): number {
  const usedDeaths = new Set<number>();
  const usedLives = new Set<number>();
  const ordered = pairs
    .filter((pair) => Math.abs(pair.delta - offsetMs) <= DEATH_MATCH_WINDOW_MS)
    .filter((pair) => pair.startGap == null || pair.startGap > offsetMs)
    .sort((a, b) => Math.abs(a.delta - offsetMs) - Math.abs(b.delta - offsetMs));
  for (const pair of ordered) {
    if (!usedDeaths.has(pair.deathIndex) && !usedLives.has(pair.lifeIndex)) {
      usedDeaths.add(pair.deathIndex);
      usedLives.add(pair.lifeIndex);
    }
  }
  return usedDeaths.size;
}

// the plateau's centre is kept: at its edge every pairing delta would be the half-window
function plateauCentre(pairs: readonly NearbyPair[]): number {
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
  return plateau[Math.floor(plateau.length / 2)] ?? 0;
}

export function bestDeathOffset(lives: readonly BipedLife[], deaths: readonly DeathEvent[]): number {
  return plateauCentre(nearbyPairs(lives, deaths, previousDeathByIndex(deaths)));
}

export function alignDeathsToFilm(deaths: readonly DeathEvent[], offsetMs: number): DeathEvent[] {
  return deaths.map((death) => ({ ...death, timestampMs: death.timestampMs + offsetMs }));
}

export function nameLivesByDeaths(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  offsetMs: number,
): BipedLife[] {
  const pairs = nearbyPairs(lives, deaths, previousDeathByIndex(deaths));
  const named = [...lives];
  for (const pairing of pairDeathsToLives(pairs, offsetMs)) {
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

function covers(life: BipedLife, atMs: number): boolean {
  return life.startMs <= atMs && life.endMs >= atMs;
}

// decisive only when exactly one member who may be present has no named biped, that member
// is certainly present, and the candidate life is the only unnamed biped alive, so neither a
// late joiner inside the tolerance nor two overlapping unnamed lives can mislead it
function soleMissingPlayer(lives: readonly BipedLife[], roster: readonly RosterMember[], atMs: number): string | null {
  const alive = lives.filter((life) => covers(life, atMs));
  if (alive.filter((life) => life.xuid == null).length !== 1) {
    return null;
  }
  const named = new Set(alive.map((life) => life.xuid));
  const unaccounted = roster.filter((member) => mayBePresent(member, atMs) && !named.has(member.xuid));
  const [only] = unaccounted;
  return unaccounted.length === 1 && only != null && isPresent(only, atMs) ? only.xuid : null;
}

// the set of live bipeds only changes where some life starts or ends, so the span is judged
// once between each pair of neighbouring boundaries and at its own ends
function decisiveInstants(lives: readonly BipedLife[], life: BipedLife): number[] {
  const boundaries = new Set<number>([life.startMs, life.endMs]);
  for (const other of lives) {
    for (const edge of [other.startMs, other.endMs]) {
      if (edge > life.startMs && edge < life.endMs) {
        boundaries.add(edge);
      }
    }
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  const instants = [...sorted];
  for (let index = 1; index < sorted.length; index++) {
    instants.push(((sorted[index - 1] ?? 0) + (sorted[index] ?? 0)) / 2);
  }
  return instants;
}

function lastDeathBefore(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  xuid: string,
  atMs: number,
): number | null {
  let lastEnd: number | null = null;
  for (const life of lives) {
    if (life.xuid === xuid && life.endMs < atMs && (lastEnd == null || life.endMs > lastEnd)) {
      lastEnd = life.endMs;
    }
  }
  for (const death of deaths) {
    if (death.xuid === xuid && death.timestampMs < atMs && (lastEnd == null || death.timestampMs > lastEnd)) {
      lastEnd = death.timestampMs;
    }
  }
  return lastEnd;
}

function overlapsNamedLife(lives: readonly BipedLife[], xuid: string, life: BipedLife): boolean {
  return lives.some((other) => other.xuid === xuid && other.startMs <= life.endMs && other.endMs >= life.startMs);
}

type OwnerAt = (atMs: number) => string | null;

// a dead player has no life at all for a few seconds, so single instants are unreliable; the
// life is named only when every decisive instant along its span agrees
function eliminatedOwner(lives: readonly BipedLife[], ownerAt: OwnerAt, life: BipedLife): string | null {
  const owners = new Set<string>();
  for (const atMs of decisiveInstants(lives, life)) {
    const owner = ownerAt(atMs);
    if (owner != null) {
      owners.add(owner);
    }
  }
  const [only] = owners;
  return owners.size === 1 && only != null ? only : null;
}

function memoisedOwnerAt(lives: readonly BipedLife[], roster: readonly RosterMember[]): OwnerAt {
  const memo = new Map<number, string | null>();
  return (atMs) => {
    const known = memo.get(atMs);
    if (known !== undefined) {
      return known;
    }
    const owner = soleMissingPlayer(lives, roster, atMs);
    memo.set(atMs, owner);
    return owner;
  };
}

// a biped cannot belong to a player who died less than a respawn ago
function couldHaveRespawned(lives: readonly BipedLife[], xuid: string, life: BipedLife): boolean {
  const lastEnd = lastDeathBefore(lives, [], xuid, life.startMs);
  return lastEnd == null || life.startMs - lastEnd >= MIN_RESPAWN_MS;
}

// every present player has exactly one live biped at any instant, so an unnamed life whose span
// leaves exactly one roster member unaccounted for belongs to that member; naming one life can
// settle the next, so the pass repeats until nothing changes
export function nameLivesByElimination(lives: readonly BipedLife[], roster: readonly RosterMember[]): BipedLife[] {
  let named = [...lives];
  let changed = true;
  while (changed) {
    changed = false;
    const ownerAt = memoisedOwnerAt(named, roster);
    const next = [...named];
    for (const [index, life] of named.entries()) {
      if (life.xuid != null) {
        continue;
      }
      const owner = eliminatedOwner(named, ownerAt, life);
      if (owner != null && couldHaveRespawned(named, owner, life) && !overlapsNamedLife(next, owner, life)) {
        next[index] = { ...life, xuid: owner };
        changed = true;
      }
    }
    named = next;
  }
  return named;
}

function hasNeverSpawned(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  member: RosterMember,
  atMs: number,
): boolean {
  return (
    mayBePresent(member, atMs) &&
    !lives.some((life) => life.xuid === member.xuid && life.startMs <= atMs) &&
    !deaths.some((death) => death.xuid === member.xuid && death.timestampMs < atMs)
  );
}

function respawnWait(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  member: RosterMember,
  life: BipedLife,
): number | null {
  if (!mayBePresent(member, life.startMs) || overlapsNamedLife(lives, member.xuid, life)) {
    return null;
  }
  const lastEnd = lastDeathBefore(lives, deaths, member.xuid, life.startMs);
  if (lastEnd == null) {
    return null;
  }
  const wait = life.startMs - lastEnd;
  return wait >= MIN_RESPAWN_MS && wait <= MAX_RESPAWN_MS ? wait : null;
}

function longestWaitingPlayer(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  roster: readonly RosterMember[],
  life: BipedLife,
): string | null {
  if (roster.some((member) => hasNeverSpawned(lives, deaths, member, life.startMs))) {
    return null;
  }
  const waits = roster
    .map((member) => ({ xuid: member.xuid, wait: respawnWait(lives, deaths, member, life) }))
    .filter((entry): entry is { xuid: string; wait: number } => entry.wait != null)
    .sort((a, b) => b.wait - a.wait);
  const [longest, runnerUp] = waits;
  if (longest == null || runnerUp?.wait === longest.wait) {
    return null;
  }
  return longest.xuid;
}

function nameSlot(lives: BipedLife[], slot: number, owner: string): void {
  for (const [index, life] of lives.entries()) {
    if (life.slot === slot && life.xuid == null) {
      lives[index] = { ...life, xuid: owner };
    }
  }
}

// a player is dead from their last known death, read from the end of a named life or from the
// death feed, until a biped appears for them again; the respawn delay is shared by every player
// in a match, so the longest-dead candidate respawns first. Slot ownership is applied before
// and as soon as it is known, so a player's deferred lives count as theirs when later lives
// are ranked
export function nameLivesByRespawnOrder(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  roster: readonly RosterMember[],
): BipedLife[] {
  const named = nameLivesBySlot(lives);
  const order = [...named.keys()].sort((a, b) => (named[a]?.startMs ?? 0) - (named[b]?.startMs ?? 0));
  for (const index of order) {
    const life = named[index];
    if (life == null || life.xuid != null) {
      continue;
    }
    const owner = longestWaitingPlayer(named, deaths, roster, life);
    if (owner != null) {
      nameSlot(named, life.slot, owner);
    }
  }
  return named;
}
