/**
 * Joins LevelUp's raw biped position dump (positions.csv, playerindex.csv via cmd/tmp_ctfpos) with the
 * statborg CTF events (events.json from ctf-statborg.ts --json=) to derive, in quantum space:
 *   - each flag stand position (cluster of carrier positions at STEAL / CAPTURE instants)
 *   - per flag-episode progress 0..1 along the stand -> capture-point axis.
 *
 * Run: npx tsx api/scripts/ctf-flag-positions.ts <filmDir>
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { walkFramePackets } from "../services/halo/statborg/bit-reader";
import { fmtMs } from "./script-services";

const dir = process.argv[2] ?? ".";
type V3 = [number, number, number];
interface Pos {
  chunk: number;
  us: bigint;
  slot: number;
  q: V3;
}
type TimedPos = Pos & { ms: number };
interface NamedEv {
  timeMs: number;
  stat: string;
  xuid: string | null;
}
type CarriedEv = NamedEv & { xuid: string };
interface Death {
  timeMs: number;
  xuid: string;
}
interface Events {
  durationMs: number;
  players: { xuid: string; team: number; gamertag: string }[];
  named: NamedEv[];
  deaths: Death[];
}

const events = JSON.parse(readFileSync(path.join(dir, "events.json"), "utf8")) as Events;
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as {
  index: number;
  startMs: number;
}[];
const startMsByChunk = new Map(manifest.map((m) => [m.index, m.startMs]));

function firstFrameUs(chunk: number): bigint {
  const data = readFileSync(path.join(dir, `chunk_${String(chunk).padStart(2, "0")}.bin`));
  return walkFramePackets(new Uint8Array(data))[0]?.timestampUs ?? 0n;
}
const baseUs = new Map<number, bigint>();
for (const m of manifest) {
  baseUs.set(m.index, firstFrameUs(m.index));
}
function usToMs(chunk: number, us: bigint): number {
  return (startMsByChunk.get(chunk) ?? 0) + Number((us - (baseUs.get(chunk) ?? 0n)) / 1000n);
}

const positions: TimedPos[] = readFileSync(path.join(dir, "positions.csv"), "utf8")
  .trim()
  .split("\n")
  .slice(1)
  .map((line) => {
    const [chunk, , us, slot, qx, qy, qz] = line.split(",");
    const p: Pos = {
      chunk: Number(chunk),
      us: BigInt(Preconditions.checkExists(us, "positions.csv row missing us column")),
      slot: Number(slot),
      q: [Number(qx), Number(qy), Number(qz)],
    };
    return { ...p, ms: usToMs(p.chunk, p.us) };
  });
positions.sort((a, b) => a.ms - b.ms);
console.log(
  `positions: ${String(positions.length)}, slots: ${String(new Set(positions.map((p) => p.slot)).size)}, span ${String(positions[0]?.ms)}..${String(positions.at(-1)?.ms)} ms`,
);

// lives: per slot, split at >5s gaps
interface Life {
  slot: number;
  fromMs: number;
  toMs: number;
  pts: TimedPos[];
  xuid: string | null;
}
function lifeOf(slot: number, pts: TimedPos[]): Life {
  const first = Preconditions.checkExists(pts[0], "life has no points");
  const last = Preconditions.checkExists(pts.at(-1), "life has no points");
  return { slot, fromMs: first.ms, toMs: last.ms, pts, xuid: null };
}
const bySlot = new Map<number, TimedPos[]>();
for (const p of positions) {
  let slotPts = bySlot.get(p.slot);
  if (slotPts == null) {
    slotPts = [];
    bySlot.set(p.slot, slotPts);
  }
  slotPts.push(p);
}
const lives: Life[] = [];
for (const [slot, pts] of bySlot) {
  let cur: TimedPos[] = [];
  for (const p of pts) {
    const last = cur.at(-1);
    if (last != null && p.ms - last.ms > 5000) {
      lives.push(lifeOf(slot, cur));
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length > 0) {
    lives.push(lifeOf(slot, cur));
  }
}
console.log(`lives: ${String(lives.length)}`);

// name lives by the death that ends them; search clock offset
interface LifeMatch {
  index: number;
  life: Life;
}
function closestUnusedLife(deathMs: number, off: number, win: number, used: Set<number>): LifeMatch | null {
  let best: LifeMatch | null = null;
  let bestD = win + 1;
  for (const [index, life] of lives.entries()) {
    const dd = Math.abs(life.toMs + off - deathMs);
    if (!used.has(index) && dd < bestD) {
      bestD = dd;
      best = { index, life };
    }
  }
  return best;
}
function countMatches(off: number, win: number): number {
  const used = new Set<number>();
  let n = 0;
  for (const d of events.deaths) {
    const best = closestUnusedLife(d.timeMs, off, win, used);
    if (best != null) {
      used.add(best.index);
      n++;
    }
  }
  return n;
}
let bestOff = 0;
let bestN = -1;
for (let off = -3000; off <= 3000; off += 10) {
  const n = countMatches(off, 150);
  if (n > bestN) {
    bestN = n;
    bestOff = off;
  }
}
console.log(
  `death naming: offset ${String(bestOff)}ms matches ${String(bestN)}/${String(events.deaths.length)} deaths`,
);
{
  const used = new Set<number>();
  for (const d of events.deaths) {
    const best = closestUnusedLife(d.timeMs, bestOff, 150, used);
    if (best != null) {
      used.add(best.index);
      best.life.xuid = d.xuid;
    }
  }
}
// survivors / unnamed lives: name by elimination — at any instant each player has one live biped
for (const l of lives) {
  if (l.xuid != null) {
    continue;
  }
  const mid = (l.fromMs + l.toMs) / 2;
  const alive = new Set(lives.filter((o) => o.xuid != null && o.fromMs <= mid && o.toMs >= mid).map((o) => o.xuid));
  const missing = events.players.filter((p) => !alive.has(p.xuid));
  const [onlyMissing] = missing;
  if (missing.length === 1 && onlyMissing != null) {
    l.xuid = onlyMissing.xuid;
  }
}
const named = lives.filter((l) => l.xuid != null);
console.log(
  `named lives: ${String(named.length)}/${String(lives.length)}; unnamed: ${lives
    .filter((l) => l.xuid == null)
    .map((l) => `slot${String(l.slot)}[${String(Math.round(l.fromMs / 1000))}-${String(Math.round(l.toMs / 1000))}s]`)
    .join(" ")}`,
);

function posAt(xuid: string, ms: number, tolMs = 600): V3 | null {
  let best: TimedPos | null = null;
  let bestD = tolMs + 1;
  for (const l of named) {
    if (l.xuid !== xuid || ms < l.fromMs - tolMs || ms > l.toMs + tolMs) {
      continue;
    }
    for (const p of l.pts) {
      const d = Math.abs(p.ms - ms);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best != null ? best.q : null;
}
const teamOf = new Map(events.players.map((p) => [p.xuid, p.team]));
const tagOf = new Map(events.players.map((p) => [p.xuid, p.gamertag]));
function tagFor(xuid: string): string {
  return Preconditions.checkExists(tagOf.get(xuid), `no gamertag for ${xuid}`);
}
function hasXuid(n: NamedEv): n is CarriedEv {
  return n.xuid != null;
}

// stands: flag of team X is stolen by team Y players at X's stand; captured by Y at Y's stand
const steals = events.named.filter((n): n is CarriedEv => n.stat === "steal" && hasXuid(n));
const captures = events.named.filter((n): n is CarriedEv => n.stat === "capture" && hasXuid(n));
function median(vs: V3[]): V3 | null {
  if (vs.length === 0) {
    return null;
  }
  const m = (i: number): number => {
    const a = vs.map((v) => Preconditions.checkExists(v[i], "axis index out of range")).sort((x, y) => x - y);
    return Preconditions.checkExists(a[Math.floor(a.length / 2)], "median of empty list");
  };
  return [m(0), m(1), m(2)];
}
const standOf = new Map<number, V3>(); // team -> its own flag stand (where enemies steal)
const capPointOf = new Map<number, V3>(); // team -> where it captures
for (const team of [0, 1]) {
  const enemyStealPts = steals
    .filter((s) => teamOf.get(s.xuid) !== team)
    .map((s) => ({ s, p: posAt(s.xuid, s.timeMs) }));
  const capPts = captures.filter((c) => teamOf.get(c.xuid) === team).map((c) => ({ c, p: posAt(c.xuid, c.timeMs) }));
  console.log(
    `\nTeam ${String(team)} stand (enemy steal positions): ${enemyStealPts.map(({ s, p }) => `${tagFor(s.xuid)}@${String(s.timeMs)}=${p != null ? p.join("/") : "?"}`).join("  ")}`,
  );
  console.log(
    `Team ${String(team)} capture point (own captures): ${capPts.map(({ c, p }) => `${tagFor(c.xuid)}@${String(c.timeMs)}=${p != null ? p.join("/") : "?"}`).join("  ")}`,
  );
  const st = median(enemyStealPts.map((x) => x.p).filter((p): p is V3 => p != null));
  if (st != null) {
    standOf.set(team, st);
  }
  const cp = median(capPts.map((x) => x.p).filter((p): p is V3 => p != null));
  if (cp != null) {
    capPointOf.set(team, cp);
  }
}
console.log(`\nstands: ${JSON.stringify([...standOf])} capturePoints: ${JSON.stringify([...capPointOf])}`);

// flag episodes: steal -> (capture | return | auto-return 30s after last drop | next steal of same flag)
interface Episode {
  flagTeam: number;
  attackTeam: number;
  startMs: number;
  endMs: number;
  end: string;
  samples: { ms: number; progress: number; carrier: string | null }[];
  markers: { ms: number; kind: string; who: string }[];
}
interface EpisodeState {
  ep: Episode;
  carrier: string | null;
  lastMs: number;
  lastPos: V3;
  dropMs: number;
}
function stepTo(state: EpisodeState, progressOf: (p: V3) => number, toMs: number): void {
  for (let t = state.lastMs; t < toMs; t += 500) {
    const p = state.carrier != null ? (posAt(state.carrier, t) ?? state.lastPos) : state.lastPos;
    state.lastPos = p;
    state.ep.samples.push({
      ms: t,
      progress: progressOf(p),
      carrier: state.carrier != null ? tagFor(state.carrier) : null,
    });
  }
  state.lastMs = toMs;
}
function findCarrierDeath(state: EpisodeState, deaths: Death[], untilMs: number | null): Death | undefined {
  const { carrier, lastMs } = state;
  if (carrier == null) {
    return undefined;
  }
  return deaths.find((d) => d.xuid === carrier && d.timeMs > lastMs && (untilMs == null || d.timeMs <= untilMs));
}
const AUTO_RETURN_MS = 30000;
const flagEvents = events.named
  .filter((n): n is CarriedEv => hasXuid(n) && ["steal", "grab", "capture", "return"].includes(n.stat))
  .sort((a, b) => a.timeMs - b.timeMs);
const episodes: Episode[] = [];
for (const flagTeam of [0, 1]) {
  const attackTeam = 1 - flagTeam;
  const evs = flagEvents.filter((e) =>
    e.stat === "return" ? teamOf.get(e.xuid) === flagTeam : teamOf.get(e.xuid) === attackTeam,
  );
  const deaths = events.deaths.filter((d) => teamOf.get(d.xuid) === attackTeam);
  const stand = standOf.get(flagTeam);
  const cap = capPointOf.get(attackTeam);
  if (stand == null || cap == null) {
    console.log(`no axis for flag of team ${String(flagTeam)}`);
    continue;
  }
  const axis: V3 = [cap[0] - stand[0], cap[1] - stand[1], cap[2] - stand[2]];
  const axisLen2 = axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2;
  const progressOf = (p: V3): number =>
    Math.max(
      0,
      Math.min(1, ((p[0] - stand[0]) * axis[0] + (p[1] - stand[1]) * axis[1] + (p[2] - stand[2]) * axis[2]) / axisLen2),
    );
  let i = 0;
  while (i < evs.length) {
    const startEv = Preconditions.checkExists(evs[i], "event index out of range");
    if (startEv.stat !== "steal") {
      i++;
      continue;
    }
    const ep: Episode = {
      flagTeam,
      attackTeam,
      startMs: startEv.timeMs,
      endMs: -1,
      end: "?",
      samples: [],
      markers: [],
    };
    const state: EpisodeState = { ep, carrier: startEv.xuid, lastMs: startEv.timeMs, lastPos: stand, dropMs: -1 };
    ep.markers.push({ ms: state.lastMs, kind: "steal", who: tagFor(startEv.xuid) });
    i++;
    while (i < evs.length) {
      const e = Preconditions.checkExists(evs[i], "event index out of range");
      // carrier death before next event?
      const death = findCarrierDeath(state, deaths, e.timeMs);
      if (death != null) {
        stepTo(state, progressOf, death.timeMs);
        ep.markers.push({ ms: death.timeMs, kind: "drop", who: tagFor(death.xuid) });
        state.carrier = null;
        state.dropMs = death.timeMs;
      }
      if (state.carrier == null && state.dropMs > 0 && e.timeMs - state.dropMs > AUTO_RETURN_MS) {
        stepTo(state, progressOf, state.dropMs + AUTO_RETURN_MS);
        ep.endMs = state.dropMs + AUTO_RETURN_MS;
        ep.end = "auto-return";
        break;
      }
      stepTo(state, progressOf, e.timeMs);
      if (e.stat === "steal") {
        ep.endMs = e.timeMs;
        ep.end = "auto-return(before next steal)";
        break;
      }
      if (e.stat === "grab") {
        state.carrier = e.xuid;
        state.dropMs = -1;
        ep.markers.push({ ms: e.timeMs, kind: "grab", who: tagFor(e.xuid) });
        i++;
        continue;
      }
      if (e.stat === "capture") {
        ep.samples.push({ ms: e.timeMs, progress: 1, carrier: tagFor(e.xuid) });
        ep.markers.push({ ms: e.timeMs, kind: "capture", who: tagFor(e.xuid) });
        ep.endMs = e.timeMs;
        ep.end = "capture";
        i++;
        break;
      }
      if (e.stat === "return") {
        const rp = posAt(e.xuid, e.timeMs);
        const dist =
          rp != null ? Math.hypot(rp[0] - state.lastPos[0], rp[1] - state.lastPos[1], rp[2] - state.lastPos[2]) : null;
        console.log(
          `  [check] return by ${tagFor(e.xuid)} at ${String(e.timeMs)}: returner pos ${rp != null ? rp.join("/") : "?"} vs flag drop pos ${state.lastPos.join("/")} dist=${dist == null ? "?" : dist.toFixed(0)} quanta`,
        );
        ep.markers.push({ ms: e.timeMs, kind: "return", who: tagFor(e.xuid) });
        ep.endMs = e.timeMs;
        ep.end = "return";
        i++;
        break;
      }
      i++;
    }
    if (ep.endMs < 0) {
      const death = findCarrierDeath(state, deaths, null);
      if (death != null) {
        stepTo(state, progressOf, death.timeMs);
        state.carrier = null;
        state.dropMs = death.timeMs;
      }
      const endMs = Math.min(events.durationMs, state.dropMs > 0 ? state.dropMs + AUTO_RETURN_MS : events.durationMs);
      stepTo(state, progressOf, endMs);
      ep.endMs = endMs;
      ep.end = state.dropMs > 0 ? "auto-return/end" : "match-end";
    }
    episodes.push(ep);
  }
}
episodes.sort((a, b) => a.startMs - b.startMs);
for (const ep of episodes) {
  const max = Math.max(...ep.samples.map((s) => s.progress), 0);
  console.log(
    `\nFlag of T${String(ep.flagTeam)} taken by T${String(ep.attackTeam)}: ${fmtMs(ep.startMs)} -> ${fmtMs(ep.endMs)} end=${ep.end} maxProgress=${(max * 100).toFixed(0)}%`,
  );
  console.log(`  markers: ${ep.markers.map((m) => `${fmtMs(m.ms)} ${m.kind}(${m.who})`).join(", ")}`);
  const spark = ep.samples
    .filter((_, k) => k % 4 === 0)
    .map((s) => "▁▂▃▄▅▆▇█"[Math.min(7, Math.floor(s.progress * 8))])
    .join("");
  console.log(`  progress(2s): ${spark}`);
}
writeFileSync(
  path.join(dir, "episodes.json"),
  JSON.stringify({ stands: [...standOf], capturePoints: [...capPointOf], episodes }, null, 1),
);
