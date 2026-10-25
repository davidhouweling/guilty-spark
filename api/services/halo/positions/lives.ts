import { byTimestamp, groupBySlot } from "./group-by-slot";
import { isPresent, mayBePresent } from "./roster";
import type { BipedLife, BipedPosition, DeathEvent, DeathNaming, RosterMember } from "./types";

// a gap this long inside one slot opens a new life: far above the replication cadence and
// well below the respawn time
export const LIFE_GAP_MS = 5_000;
const MIN_RESPAWN_MS = 1_000;
const MAX_RESPAWN_MS = 30_000;
// a lone sample that survived the isolation filter is a chance match, not a life
const MIN_LIFE_SAMPLES = 2;
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
  return lives
    .filter((life) => life.samples.length >= MIN_LIFE_SAMPLES)
    .map((life) => ({
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
function isFeasible(pair: NearbyPair, offsetMs: number): boolean {
  return (
    Math.abs(pair.delta - offsetMs) <= DEATH_MATCH_WINDOW_MS && (pair.startGap == null || pair.startGap > offsetMs)
  );
}

function feasiblePairs(pairs: readonly NearbyPair[], offsetMs: number): Pairing[] {
  return pairs
    .filter((pair) => isFeasible(pair, offsetMs))
    .map(({ deathIndex, lifeIndex }) => ({ deathIndex, lifeIndex }));
}

// a pair is forced when one side has no other option and the other side is nobody else's
// only option; a death whose only life is also another death's only life stays open
interface PairComponent {
  readonly deaths: number[];
  readonly pairs: Pairing[];
}

// deaths linked through shared candidate lives form one component; a settlement in one
// component never depends on another
function pairComponents(open: readonly Pairing[]): PairComponent[] {
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
function maximumMatchings(component: PairComponent): Pairing[][] {
  const matchings: Pairing[][] = [];
  let best = 0;
  const visit = (deathPosition: number, usedLives: Set<number>, chosen: Pairing[]): void => {
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

function pairsInEveryMaximumMatching(component: PairComponent): Pairing[] {
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
function pairDeathsToLives(pairs: readonly NearbyPair[], offsetMs: number): Pairing[] {
  return pairComponents(feasiblePairs(pairs, offsetMs)).flatMap(pairsInEveryMaximumMatching);
}

// an augmenting-path search gives the size of the largest one-to-one matching, so a death
// beside a cluster of lives counts once and a near miss never shadows a feasible pair
function maximumMatchingSize(pairs: readonly Pairing[]): number {
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

function pairingKey(pair: Pairing): string {
  return `${String(pair.deathIndex)}|${String(pair.lifeIndex)}`;
}

// the clock is only known to the width of the plateau, so a pairing counts only if it is
// settled at every offset on it
function pairingsSettledAcrossPlateau(pairs: readonly NearbyPair[], plateau: readonly number[]): Pairing[] {
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

export function nameLivesByDeaths(lives: readonly BipedLife[], deaths: readonly DeathEvent[]): DeathNaming {
  const pairs = nearbyPairs(lives, deaths, previousDeathByIndex(deaths));
  const plateau = optimalOffsets(pairs);
  const offsetMs = plateau[Math.floor(plateau.length / 2)] ?? null;
  const named = [...lives];
  for (const pairing of pairingsSettledAcrossPlateau(pairs, plateau)) {
    const life = named[pairing.lifeIndex];
    const death = deaths[pairing.deathIndex];
    if (life != null && death != null) {
      named[pairing.lifeIndex] = { ...life, xuid: death.xuid };
    }
  }
  return { lives: named, offsetMs };
}

function overlapsNamedLife(lives: readonly BipedLife[], xuid: string, life: BipedLife): boolean {
  return lives.some((other) => other.xuid === xuid && other.startMs <= life.endMs && other.endMs >= life.startMs);
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

// a name extends to another life only where the owner may be present and has no other biped
function canOwn(lives: readonly BipedLife[], roster: readonly RosterMember[], owner: string, life: BipedLife): boolean {
  const member = roster.find((candidate) => candidate.xuid === owner);
  return member != null && mayBePresent(member, life.startMs) && !overlapsNamedLife(lives, owner, life);
}

// a slot keeps its owner for the whole film (LevelUp measured no slot changing hands), so the
// one name a slot's lives agree on extends to the slot's unnamed lives, each checked against
// the names already extended
export function nameLivesBySlot(lives: readonly BipedLife[], roster: readonly RosterMember[]): BipedLife[] {
  const owners = slotOwners(lives);
  const named = [...lives];
  for (const [index, life] of named.entries()) {
    const set = owners.get(life.slot);
    const [owner] = set ?? [];
    if (life.xuid == null && set?.size === 1 && owner != null && canOwn(named, roster, owner, life)) {
      named[index] = { ...life, xuid: owner };
    }
  }
  return named;
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

// the feed carries the exact death instant while a life's last sample lands a few frames
// either side of it, so the feed time is preferred wherever it matches the sampled end;
// a sampled end with no feed death near it still counts
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
  let lastDeath: number | null = null;
  for (const death of deaths) {
    if (death.xuid === xuid && death.timestampMs < atMs && (lastDeath == null || death.timestampMs > lastDeath)) {
      lastDeath = death.timestampMs;
    }
  }
  if (lastEnd != null && lastDeath != null && Math.abs(lastEnd - lastDeath) <= DEATH_MATCH_WINDOW_MS) {
    return lastDeath;
  }
  return lastEnd == null || lastDeath == null ? (lastEnd ?? lastDeath) : Math.max(lastEnd, lastDeath);
}

// lives are judged earliest first so a life's verdict can see every life that ended before it
function byStartTime(lives: readonly BipedLife[]): number[] {
  return [...lives.keys()].sort((a, b) => (lives[a]?.startMs ?? 0) - (lives[b]?.startMs ?? 0));
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
function couldHaveRespawned(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  xuid: string,
  life: BipedLife,
): boolean {
  const lastEnd = lastDeathBefore(lives, deaths, xuid, life.startMs);
  return lastEnd == null || life.startMs - lastEnd >= MIN_RESPAWN_MS;
}

// every present player has exactly one live biped at any instant, so an unnamed life whose span
// leaves exactly one roster member unaccounted for belongs to that member; naming one life can
// settle the next, so the pass repeats until nothing changes
export function nameLivesByElimination(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  roster: readonly RosterMember[],
): BipedLife[] {
  let named = [...lives];
  let changed = true;
  while (changed) {
    changed = false;
    const ownerAt = memoisedOwnerAt(named, roster);
    const next = [...named];
    for (const index of byStartTime(named)) {
      const life = named[index];
      if (life == null || life.xuid != null) {
        continue;
      }
      const owner = eliminatedOwner(named, ownerAt, life);
      if (owner != null && couldHaveRespawned(next, deaths, owner, life) && canOwn(next, roster, owner, life)) {
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

// an unnamed life still open at this instant belongs to someone, so some candidate's wait is
// not what it seems and no guess is made
function hasOpenUnnamedLife(lives: readonly BipedLife[], life: BipedLife): boolean {
  return lives.some((other) => other !== life && other.xuid == null && covers(other, life.startMs));
}

function longestWaitingPlayer(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  roster: readonly RosterMember[],
  life: BipedLife,
): string | null {
  if (
    hasOpenUnnamedLife(lives, life) ||
    roster.some((member) => hasNeverSpawned(lives, deaths, member, life.startMs))
  ) {
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

function nameSlot(lives: BipedLife[], roster: readonly RosterMember[], slot: number, owner: string): void {
  for (const [index, life] of lives.entries()) {
    if (life.slot === slot && life.xuid == null && canOwn(lives, roster, owner, life)) {
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
  const named = nameLivesBySlot(lives, roster);
  for (const index of byStartTime(named)) {
    const life = named[index];
    if (life == null || life.xuid != null) {
      continue;
    }
    const owner = longestWaitingPlayer(named, deaths, roster, life);
    if (owner != null) {
      nameSlot(named, roster, life.slot, owner);
    }
  }
  return named;
}
