/**
 * Port of LevelUp's statborg entity-record decoder (apps/go-api/internal/analysis/objectiveevents/statborg.go,
 * named.go, slotidentity.go) to extract ms-timed per-player CTF stat increments from film FRAME packets.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/ctf-statborg.ts <matchId> [--dump]
 */
import { writeFileSync } from "node:fs";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { createScriptServices, enrichEventsWithTeamIds, fmtMs } from "./script-services";

const MATCH_ID = process.argv[2] ?? "5e3900a6-69ee-42f6-9a79-5146e8802a0c";
const DUMP = process.argv.includes("--dump");
const JSON_OUT = process.argv.find((a) => a.startsWith("--json="))?.slice(7);

interface StatValue {
  a: number;
  b: number;
}
interface StatRecord {
  timeMs: number;
  slot: number;
  comps: Map<number, StatValue>;
}
interface FramePacket {
  us: bigint;
  off: number;
  size: number;
}

function readBitsBE(data: Uint8Array, bitPos: number, n: number): number {
  let r = 0;
  for (let i = 0; i < n; i++) {
    const bi = (bitPos + i) >> 3;
    const byte = data[bi];
    if (byte == null) {
      return r;
    }
    const off = 7 - ((bitPos + i) & 7);
    r = r * 2 + ((byte >> off) & 1);
  }
  return r;
}

function walkFrames(data: Uint8Array): FramePacket[] {
  const out: FramePacket[] = [];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 0;
  while (off + 16 <= data.length) {
    const typ = dv.getUint16(off, true);
    const size = dv.getUint32(off + 4, true);
    const us = dv.getBigUint64(off + 8, true);
    if (size > data.length) {
      break;
    }
    if (typ === 0 && off + 16 + size <= data.length) {
      out.push({ us, off: off + 16, size });
    }
    off += 16 + size;
    if (typ === 7) {
      break;
    }
  }
  return out;
}

function readStatVarWidth(pay: Uint8Array, p: number): [number, number] | null {
  if (p < 0 || p + 2 > pay.length * 8) {
    return null;
  }
  const w = 8 << readBitsBE(pay, p, 2);
  if (w > 32 || p + 2 + w > pay.length * 8) {
    return null;
  }
  let v = readBitsBE(pay, p + 2, w);
  if (w < 32 && v >= 2 ** (w - 1)) {
    v -= 2 ** w;
  }
  return [v, 2 + w];
}

function decodeStatComponent(pay: Uint8Array, p: number): [StatValue, number] | null {
  let q = p + 10;
  const a = readStatVarWidth(pay, q);
  if (a == null) {
    return null;
  }
  const b = readStatVarWidth(pay, q + a[1]);
  if (b == null) {
    return null;
  }
  q += a[1] + b[1];
  if (q + 2 > pay.length * 8) {
    return null;
  }
  const flags = [readBitsBE(pay, q, 1), readBitsBE(pay, q + 1, 1)];
  q += 2;
  for (const f of flags) {
    if (f !== 1) {
      continue;
    }
    const c = readStatVarWidth(pay, q);
    if (c == null) {
      return null;
    }
    q += c[1];
  }
  return [{ a: a[0], b: b[0] }, q - p];
}

function matchRecordHeader(pay: Uint8Array, b: number): { slot: number; idx: number[]; at: number } | null {
  if (readBitsBE(pay, b - 1, 1) !== 1) {
    return null;
  }
  const slot = readBitsBE(pay, b, 14);
  if (slot < 6 || slot > 24 || slot % 2 !== 0) {
    return null;
  }
  if (readBitsBE(pay, b + 14, 2) !== 0b10) {
    return null;
  }
  const m = b + 16;
  if (readBitsBE(pay, m, 1) !== 0) {
    return null;
  }
  const n = readBitsBE(pay, m + 1, 3);
  if (n < 1 || n > 7) {
    return null;
  }
  const idx: number[] = [];
  let prev = -1;
  for (let i = 0; i < n; i++) {
    const v = readBitsBE(pay, m + 4 + 6 * i, 6);
    if (v >= 58 || v <= prev) {
      return null;
    }
    idx.push(v);
    prev = v;
  }
  return { slot, idx, at: m + 4 + 6 * n };
}

function scanFrameForRecords(pay: Uint8Array, timeMs: number): StatRecord[] {
  const out: StatRecord[] = [];
  const lim = pay.length * 8 - 64;
  for (let b = 1; b < lim; b++) {
    const h = matchRecordHeader(pay, b);
    if (h == null) {
      continue;
    }
    if (readBitsBE(pay, h.at, 5) !== 0 || readBitsBE(pay, h.at + 5, 5) !== 0) {
      continue;
    }
    const comps = new Map<number, StatValue>();
    let q = h.at;
    for (const i of h.idx) {
      const c = decodeStatComponent(pay, q);
      if (c == null) {
        break;
      }
      comps.set(i, c[0]);
      q += c[1];
    }
    if (comps.size > 0) {
      out.push({ timeMs, slot: h.slot, comps });
    }
  }
  return out;
}

interface Pt {
  timeMs: number;
  value: number;
}

function valueAtTail(pts: Pt[], tail: number[], tailIdx: number): number {
  const ptIdx = Preconditions.checkExists(tail[tailIdx], "tail index out of range");
  return Preconditions.checkExists(pts[ptIdx], "point index out of range").value;
}

function longestRun(pts: Pt[], strict: boolean): Pt[] {
  if (pts.length === 0) {
    return [];
  }
  const tail: number[] = [];
  const prev = new Array<number>(pts.length).fill(-1);
  for (const [i, p] of pts.entries()) {
    let lo = 0;
    let hi = tail.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const tv = valueAtTail(pts, tail, mid);
      const fits = strict ? tv < p.value : tv <= p.value;
      if (fits) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    prev[i] = lo > 0 ? Preconditions.checkExists(tail[lo - 1], "tail index out of range") : -1;
    if (lo === tail.length) {
      tail.push(i);
    } else {
      tail[lo] = i;
    }
  }
  const out: Pt[] = [];
  for (
    let k = Preconditions.checkExists(tail.at(-1), "empty tail");
    k >= 0;
    k = Preconditions.checkExists(prev[k], "prev index out of range")
  ) {
    out.unshift(Preconditions.checkExists(pts[k], "point index out of range"));
  }
  return out;
}

function seriesBySlot(recs: StatRecord[], comp: number, side: "a" | "b"): Map<number, Pt[]> {
  const raw = new Map<number, Pt[]>();
  for (const r of recs) {
    if (r.slot <= 8) {
      continue;
    }
    const v = r.comps.get(comp);
    if (v == null) {
      continue;
    }
    const val = v[side];
    if (val < 0) {
      continue;
    }
    let pts = raw.get(r.slot);
    if (pts == null) {
      pts = [];
      raw.set(r.slot, pts);
    }
    pts.push({ timeMs: r.timeMs, value: val });
  }
  const out = new Map<number, Pt[]>();
  for (const [slot, pts] of raw) {
    out.set(slot, longestRun(pts, false));
  }
  return out;
}

function incrementTimes(pts: Pt[]): number[] {
  const out: number[] = [];
  let prev = 0;
  for (const p of pts) {
    if (p.value - prev > 1000) {
      continue;
    }
    for (; prev < p.value; prev++) {
      out.push(p.timeMs);
    }
  }
  return out;
}

function countsOf(recs: StatRecord[], comp: number, side: "a" | "b"): Map<number, number> {
  const out = new Map<number, number>();
  for (const [slot, pts] of seriesBySlot(recs, comp, side)) {
    out.set(slot, incrementTimes(pts).length);
  }
  return out;
}

const NAMED: { comp: number; side: "a" | "b"; stat: string }[] = [
  { comp: 21, side: "a", stat: "capture" },
  { comp: 20, side: "b", stat: "capture_assist" },
  { comp: 21, side: "b", stat: "carrier_killed" },
  { comp: 22, side: "a", stat: "grab" },
  { comp: 23, side: "a", stat: "return" },
  { comp: 24, side: "a", stat: "steal" },
  { comp: 23, side: "b", stat: "secure" },
  { comp: 22, side: "b", stat: "returner_killed" },
];

const { haloService, haloFilmService } = await createScriptServices();
const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("no match");
  process.exit(1);
}
const durationMs = Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000);
const chunks = await haloFilmService.getReplicationChunks(MATCH_ID);
console.log(
  `chunks: ${String(chunks.length)} ${chunks.map((c) => `#${String(c.index)}@${String(c.startMs)}+${String(c.durationMs)}(${String(c.data.length)}B)`).join(" ")}`,
);

const recs: StatRecord[] = [];
for (const c of chunks) {
  const frames = walkFrames(c.data);
  const [firstFrame] = frames;
  if (firstFrame == null) {
    continue;
  }
  const base = firstFrame.us;
  for (const f of frames) {
    const t = c.startMs + Number((f.us - base) / 1000n);
    recs.push(...scanFrameForRecords(c.data.subarray(f.off, f.off + f.size), t));
  }
}
recs.sort((x, y) => x.timeMs - y.timeMs || x.slot - y.slot);
console.log(`stat records: ${String(recs.length)}; duration ${fmtMs(durationMs)}`);

// slot identity via (kills, deaths, assists)
const kills = countsOf(recs, 2, "a");
const deaths = countsOf(recs, 2, "b");
const assists = countsOf(recs, 3, "a");
const lines = matchStats.Players.map((p) => {
  const core = Preconditions.checkExists(p.PlayerTeamStats[0], "player has no team stats").Stats.CoreStats;
  return {
    xuid: unwrapXuid(p.PlayerId),
    gamertag: p.PlayerId,
    team: p.LastTeamId,
    k: core.Kills,
    d: core.Deaths,
    a: core.Assists,
  };
});
const slotToXuid = new Map<number, string>();
for (const slot of [...kills.keys()].sort((x, y) => x - y)) {
  const cands = lines.filter((l) => l.k === kills.get(slot) && l.d === deaths.get(slot) && l.a === assists.get(slot));
  console.log(
    `  slot ${String(slot)}: K/D/A film=${String(kills.get(slot))}/${String(deaths.get(slot))}/${String(assists.get(slot))} -> ${cands.map((c) => c.xuid).join(",") || "?"}`,
  );
  const [onlyCand] = cands;
  if (cands.length === 1 && onlyCand != null) {
    slotToXuid.set(slot, onlyCand.xuid);
  }
}
const xuidToTeam = new Map(lines.map((l) => [l.xuid, l.team]));
const events = enrichEventsWithTeamIds(await haloFilmService.getHighlightEventsForMatch(MATCH_ID), matchStats);
const xuidToTag = new Map(events.map((e) => [e.xuid, e.gamertag]));

// final value per slot per comp/side (to identify unnamed slots e.g. FlagSecures)
if (DUMP) {
  console.log("\nFinal counts per player slot (comp side): value  [only comps with any nonzero]");
  for (let comp = 0; comp < 58; comp++) {
    for (const side of ["a", "b"] as const) {
      const c = countsOf(recs, comp, side);
      if (c.size === 0) {
        continue;
      }
      const vals = [...c.entries()]
        .sort((x, y) => x[0] - y[0])
        .map(([s, v]) => `${String(s)}:${String(v)}`)
        .join(" ");
      if ([...c.values()].some((v) => v > 0)) {
        console.log(`  comp ${String(comp).padStart(2)}${side}: ${vals}`);
      }
    }
  }
}

interface Named {
  timeMs: number;
  slot: number;
  stat: string;
}
const named: Named[] = [];
for (const n of NAMED) {
  for (const [slot, pts] of seriesBySlot(recs, n.comp, n.side)) {
    for (const t of incrementTimes(pts)) {
      named.push({ timeMs: t, slot, stat: n.stat });
    }
  }
}
named.sort((x, y) => x.timeMs - y.timeMs || x.slot - y.slot);

console.log(`\nNamed CTF events: ${String(named.length)}`);
const counts = new Map<string, number>();
for (const n of named) {
  const x = slotToXuid.get(n.slot) ?? `slot${String(n.slot)}`;
  const k = `${x} ${n.stat}`;
  counts.set(k, (counts.get(k) ?? 0) + 1);
}
for (const [k, v] of [...counts.entries()].sort()) {
  console.log(`  ${k}: ${String(v)}`);
}

console.log(`\nMerged timeline (named + footer mode + kill/death):`);
interface Row {
  t: number;
  text: string;
}
const rows: Row[] = named.map((n) => {
  const x = slotToXuid.get(n.slot);
  const team = x != null ? xuidToTeam.get(x) : "?";
  const who = x != null ? (xuidToTag.get(x) ?? x) : `slot${String(n.slot)}`;
  return { t: n.timeMs, text: `${n.stat.toUpperCase().padEnd(14)} T${String(team)} ${who}` };
});
for (const e of events) {
  if (e.eventType !== "medal") {
    rows.push({ t: e.timeMs, text: `${e.eventType.padEnd(14)} T${String(e.teamId)} ${e.gamertag}` });
  }
}
rows.sort((x, y) => x.t - y.t);
for (const r of rows) {
  console.log(`  ${fmtMs(r.t)} ${String(r.t).padStart(7)} ${r.text}`);
}

if (JSON_OUT != null) {
  const payload = {
    matchId: MATCH_ID,
    durationMs,
    players: lines.map((l) => ({ xuid: l.xuid, team: l.team, gamertag: xuidToTag.get(l.xuid) ?? l.xuid })),
    named: named.map((n) => ({ timeMs: n.timeMs, stat: n.stat, xuid: slotToXuid.get(n.slot) ?? null, slot: n.slot })),
    deaths: events.filter((e) => e.eventType === "death").map((e) => ({ timeMs: e.timeMs, xuid: e.xuid })),
    kills: events.filter((e) => e.eventType === "kill").map((e) => ({ timeMs: e.timeMs, xuid: e.xuid })),
    modeEvents: events.filter((e) => e.eventType === "mode").map((e) => ({ timeMs: e.timeMs, xuid: e.xuid })),
  };
  writeFileSync(JSON_OUT, JSON.stringify(payload, null, 1));
  console.log(`wrote ${JSON_OUT}`);
}
