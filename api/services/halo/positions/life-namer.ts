import { alignDeathsToFilm, measureDeathAlignment } from "./death-pairing";
import { DEATH_MATCH_WINDOW_MS, MAX_RESPAWN_MS, MIN_RESPAWN_MS } from "./naming-constants";
import { alignRosterToFilm, isPresent, mayBePresent } from "./roster";
import type { BipedLife, DeathAlignment, DeathEvent, DeathLifePairing, RosterMember } from "./types";

function overlapsNamedLife(lives: readonly BipedLife[], xuid: string, life: BipedLife): boolean {
  return lives.some((other) => other.xuid === xuid && other.startMs <= life.endMs && other.endMs >= life.startMs);
}

function nextLifeStartsTooSoon(lives: readonly BipedLife[], xuid: string, life: BipedLife): boolean {
  return lives.some(
    (other) => other.xuid === xuid && other.startMs > life.endMs && other.startMs - life.endMs < MIN_RESPAWN_MS,
  );
}

function previousLifeEndedTooSoon(lives: readonly BipedLife[], xuid: string, life: BipedLife): boolean {
  return lives.some(
    (other) => other.xuid === xuid && other.endMs < life.startMs && life.startMs - other.endMs < MIN_RESPAWN_MS,
  );
}

function slotHasAnotherOwner(lives: readonly BipedLife[], xuid: string, life: BipedLife): boolean {
  return lives.some((other) => other.slot === life.slot && other.xuid != null && other.xuid !== xuid);
}

// a feed death inside the life, or less than a respawn before it, rules the owner out; a death
// at the life's end is the one that ended it
function diesDuringLife(deaths: readonly DeathEvent[], xuid: string, life: BipedLife): boolean {
  return deaths.some(
    (death) =>
      death.xuid === xuid &&
      death.timestampMs > life.startMs - MIN_RESPAWN_MS &&
      death.timestampMs < life.endMs - DEATH_MATCH_WINDOW_MS,
  );
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

function covers(life: BipedLife, atMs: number): boolean {
  return life.startMs <= atMs && life.endMs >= atMs;
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

// an unnamed life still open at this instant belongs to someone, so some candidate's wait is
// not what it seems and no guess is made
function hasOpenUnnamedLife(lives: readonly BipedLife[], life: BipedLife): boolean {
  return lives.some((other) => other !== life && other.xuid == null && covers(other, life.startMs));
}

function namedCount(lives: readonly BipedLife[]): number {
  return lives.filter((life) => life.xuid != null).length;
}

export interface LifeNamerConfig {
  readonly deaths: readonly DeathEvent[];
  readonly roster: readonly RosterMember[];
  readonly alignment?: DeathAlignment | undefined;
}

// Names lives after players. The deaths and roster are on the film clock; every pass goes
// through one ownership guard, and the passes repeat until no further life is named.
export class LifeNamer {
  readonly offsetMs: number | null;
  private readonly deaths: readonly DeathEvent[];
  private readonly roster: readonly RosterMember[];
  private readonly pairings: readonly DeathLifePairing[];

  constructor({ deaths, roster, alignment }: LifeNamerConfig) {
    this.deaths = deaths;
    this.roster = roster;
    this.offsetMs = alignment?.offsetMs ?? null;
    this.pairings = alignment?.pairings ?? [];
  }

  // measures the feed's clock offset against these lives and moves the feed and the roster
  // onto the film clock; a feed that fits no single clock is not used at all
  static forMatch(
    lives: readonly BipedLife[],
    deaths: readonly DeathEvent[],
    roster: readonly RosterMember[],
  ): LifeNamer {
    const alignment = measureDeathAlignment(lives, deaths, roster);
    return new LifeNamer({
      deaths: alignment.offsetMs == null ? [] : alignDeathsToFilm(deaths, alignment.offsetMs),
      roster: alignRosterToFilm(roster, alignment.offsetMs ?? 0),
      alignment,
    });
  }

  name(lives: readonly BipedLife[]): BipedLife[] {
    let named = this.byDeaths(lives);
    let before = -1;
    while (namedCount(named) !== before) {
      before = namedCount(named);
      named = this.round(named);
    }
    return named;
  }

  // the lives must be the ones the alignment was measured on, since the pairings index them
  byDeaths(lives: readonly BipedLife[]): BipedLife[] {
    const named = [...lives];
    for (const pairing of this.pairings) {
      const life = named[pairing.lifeIndex];
      const death = this.deaths[pairing.deathIndex];
      if (life != null && death != null && this.canOwn(named, death.xuid, life)) {
        named[pairing.lifeIndex] = { ...life, xuid: death.xuid };
      }
    }
    return named;
  }

  // a slot keeps its owner for the whole film (LevelUp measured no slot changing hands), so the
  // one name a slot's lives agree on extends to the slot's unnamed lives, each checked against
  // the names already extended
  bySlot(lives: readonly BipedLife[]): BipedLife[] {
    const owners = slotOwners(lives);
    const named = [...lives];
    for (const [index, life] of named.entries()) {
      const set = owners.get(life.slot);
      const [owner] = set ?? [];
      if (life.xuid == null && set?.size === 1 && owner != null && this.canOwn(named, owner, life)) {
        named[index] = { ...life, xuid: owner };
      }
    }
    return named;
  }

  // every present player has exactly one live biped at any instant, so an unnamed life whose
  // span leaves exactly one roster member unaccounted for belongs to that member; naming one
  // life can settle the next, so the pass repeats until nothing changes
  byElimination(lives: readonly BipedLife[]): BipedLife[] {
    let named = [...lives];
    let changed = true;
    while (changed) {
      changed = false;
      const ownerAt = this.memoisedOwnerAt(named);
      const next = [...named];
      for (const index of byStartTime(named)) {
        const life = named[index];
        if (life == null || life.xuid != null) {
          continue;
        }
        const owner = eliminatedOwner(named, ownerAt, life);
        if (owner != null && this.couldHaveRespawned(next, owner, life) && this.canOwn(next, owner, life)) {
          next[index] = { ...life, xuid: owner };
          changed = true;
        }
      }
      named = next;
    }
    return named;
  }

  // a player is dead from their last known death, read from the end of a named life or from
  // the death feed, until a biped appears for them again; the respawn delay is shared by every
  // player in a match, so the longest-dead candidate respawns first. Slot ownership is applied
  // before and as soon as it is known, so a player's deferred lives count as theirs when later
  // lives are ranked
  byRespawnOrder(lives: readonly BipedLife[]): BipedLife[] {
    const named = this.bySlot(lives);
    for (const index of byStartTime(named)) {
      const life = named[index];
      if (life == null || life.xuid != null) {
        continue;
      }
      const owner = this.longestWaitingPlayer(named, life);
      if (owner != null) {
        this.nameSlot(named, life.slot, owner);
      }
    }
    return named;
  }

  private round(lives: readonly BipedLife[]): BipedLife[] {
    const settled = this.byElimination(this.bySlot(lives));
    return this.byElimination(this.byRespawnOrder(settled));
  }

  // a name fits a life only where the owner may be present from its start to its end, has no
  // other biped or feed death alongside it or within a respawn on either side of it, and the
  // slot is not another player's
  private canOwn(lives: readonly BipedLife[], owner: string, life: BipedLife): boolean {
    const member = this.roster.find((candidate) => candidate.xuid === owner);
    return (
      member != null &&
      mayBePresent(member, life.startMs) &&
      mayBePresent(member, life.endMs) &&
      !overlapsNamedLife(lives, owner, life) &&
      !nextLifeStartsTooSoon(lives, owner, life) &&
      !previousLifeEndedTooSoon(lives, owner, life) &&
      !diesDuringLife(this.deaths, owner, life) &&
      !slotHasAnotherOwner(lives, owner, life)
    );
  }

  // decisive only when exactly one member who may be present has no named biped, that member
  // is certainly present, and the candidate life is the only unnamed biped alive, so neither a
  // late joiner inside the tolerance nor two overlapping unnamed lives can mislead it
  private soleMissingPlayer(lives: readonly BipedLife[], atMs: number): string | null {
    const alive = lives.filter((life) => covers(life, atMs));
    if (alive.filter((life) => life.xuid == null).length !== 1) {
      return null;
    }
    const named = new Set(alive.map((life) => life.xuid));
    const unaccounted = this.roster.filter((member) => mayBePresent(member, atMs) && !named.has(member.xuid));
    const [only] = unaccounted;
    return unaccounted.length === 1 && only != null && isPresent(only, atMs) ? only.xuid : null;
  }

  private memoisedOwnerAt(lives: readonly BipedLife[]): OwnerAt {
    const memo = new Map<number, string | null>();
    return (atMs) => {
      const known = memo.get(atMs);
      if (known !== undefined) {
        return known;
      }
      const owner = this.soleMissingPlayer(lives, atMs);
      memo.set(atMs, owner);
      return owner;
    };
  }

  // the feed carries the exact death instant while a life's last sample lands a few frames
  // either side of it, so the feed time is preferred wherever it matches the sampled end;
  // a sampled end with no feed death near it still counts
  private lastDeathBefore(lives: readonly BipedLife[], xuid: string, atMs: number): number | null {
    let lastEnd: number | null = null;
    for (const life of lives) {
      if (life.xuid === xuid && life.endMs < atMs && (lastEnd == null || life.endMs > lastEnd)) {
        lastEnd = life.endMs;
      }
    }
    let lastDeath: number | null = null;
    for (const death of this.deaths) {
      if (death.xuid === xuid && death.timestampMs < atMs && (lastDeath == null || death.timestampMs > lastDeath)) {
        lastDeath = death.timestampMs;
      }
    }
    if (lastEnd != null && lastDeath != null && Math.abs(lastEnd - lastDeath) <= DEATH_MATCH_WINDOW_MS) {
      return lastDeath;
    }
    return lastEnd == null || lastDeath == null ? (lastEnd ?? lastDeath) : Math.max(lastEnd, lastDeath);
  }

  // a biped cannot belong to a player who died less than a respawn ago
  private couldHaveRespawned(lives: readonly BipedLife[], xuid: string, life: BipedLife): boolean {
    const lastEnd = this.lastDeathBefore(lives, xuid, life.startMs);
    return lastEnd == null || life.startMs - lastEnd >= MIN_RESPAWN_MS;
  }

  private hasNeverSpawned(lives: readonly BipedLife[], member: RosterMember, atMs: number): boolean {
    return (
      mayBePresent(member, atMs) &&
      !lives.some((life) => life.xuid === member.xuid && life.startMs <= atMs) &&
      !this.deaths.some((death) => death.xuid === member.xuid && death.timestampMs < atMs)
    );
  }

  private respawnWait(lives: readonly BipedLife[], member: RosterMember, life: BipedLife): number | null {
    if (!this.canOwn(lives, member.xuid, life)) {
      return null;
    }
    const lastEnd = this.lastDeathBefore(lives, member.xuid, life.startMs);
    if (lastEnd == null) {
      return null;
    }
    const wait = life.startMs - lastEnd;
    return wait >= MIN_RESPAWN_MS && wait <= MAX_RESPAWN_MS ? wait : null;
  }

  private longestWaitingPlayer(lives: readonly BipedLife[], life: BipedLife): string | null {
    if (
      hasOpenUnnamedLife(lives, life) ||
      this.roster.some((member) => this.hasNeverSpawned(lives, member, life.startMs))
    ) {
      return null;
    }
    const waits = this.roster
      .map((member) => ({ xuid: member.xuid, wait: this.respawnWait(lives, member, life) }))
      .filter((entry): entry is { xuid: string; wait: number } => entry.wait != null)
      .sort((a, b) => b.wait - a.wait);
    const [longest, runnerUp] = waits;
    if (longest == null || runnerUp?.wait === longest.wait) {
      return null;
    }
    return longest.xuid;
  }

  private nameSlot(lives: BipedLife[], slot: number, owner: string): void {
    for (const [index, life] of lives.entries()) {
      if (life.slot === slot && life.xuid == null && this.canOwn(lives, owner, life)) {
        lives[index] = { ...life, xuid: owner };
      }
    }
  }
}
