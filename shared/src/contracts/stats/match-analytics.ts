import { z } from "zod";

// counts keyed by stringified team id
const teamKeyedCountsSchema = z.record(z.string().regex(/^\d+$/), z.number().int().nonnegative());

const progressionEventSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  teamId: z.number().int().nonnegative(),
  runningScores: teamKeyedCountsSchema,
});

const killRaceEventSchema = progressionEventSchema;

const teamDeathEventSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  teamId: z.number().int().nonnegative(),
});

// death timeline plus the mode's respawn duration — the inputs of the player-advantage overlay,
// shared by every respawn-bearing mode timeline
const deathOverlayFields = {
  deathTimeline: z.array(teamDeathEventSchema),
  respawnDurationMs: z.number().int().positive().nullable(),
};

export type KillRaceEvent = z.infer<typeof killRaceEventSchema>;
export type TeamDeathEvent = z.infer<typeof teamDeathEventSchema>;

const killRaceTimelineSchema = z.object({
  type: z.literal("kill-race"),
  events: z.array(killRaceEventSchema),
  ...deathOverlayFields,
});

const kothEventSchema = progressionEventSchema;

const kothControlPeriodSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  controllingTeamId: z.number().int().nonnegative().nullable(),
});

const kothTimelineSchema = z.object({
  type: z.literal("koth"),
  events: z.array(kothEventSchema),
  controlPeriods: z.array(kothControlPeriodSchema),
  hillCaptureTimestamps: z.array(z.number().int().nonnegative()),
});

export type KothEvent = z.infer<typeof kothEventSchema>;
export type KothControlPeriod = z.infer<typeof kothControlPeriodSchema>;
export type KothTimeline = z.infer<typeof kothTimelineSchema>;

const oddballCarrySegmentSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  teamId: z.number().int().nonnegative(),
});

const oddballRoundSchema = z.object({
  roundIndex: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  endedByCap: z.boolean(),
  winnerTeamId: z.number().int().nonnegative().nullable(),
  scores: teamKeyedCountsSchema,
  carrySegments: z.array(oddballCarrySegmentSchema),
});

const oddballTimelineSchema = z.object({
  type: z.literal("oddball"),
  rounds: z.array(oddballRoundSchema),
});

export type OddballCarrySegment = z.infer<typeof oddballCarrySegmentSchema>;
export type OddballRound = z.infer<typeof oddballRoundSchema>;
export type OddballTimeline = z.infer<typeof oddballTimelineSchema>;

// Strongholds scoring accrues continuously for both teams at once, so a sample carries no
// scoring team — only the running totals at a rate boundary.
const strongholdsEventSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  runningScores: teamKeyedCountsSchema,
});

// Capture/secure identities come from the solver's best labeling: the deduped event groups
// match the API totals exactly, but which single-credit groups are the secures is inferred.
const strongholdsZoneEventSchema = teamDeathEventSchema.extend({
  kind: z.enum(["capture", "secure"]),
});

// Zones owned by each team after a capture resolves (zone identity is not recoverable from
// film, but per-team counts are); the unowned remainder of the three zones is neutral.
const strongholdsZoneCountSampleSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  zoneCounts: teamKeyedCountsSchema,
});

const strongholdsTimelineSchema = z.object({
  type: z.literal("strongholds"),
  events: z.array(strongholdsEventSchema),
  zoneEvents: z.array(strongholdsZoneEventSchema),
  zoneTimeline: z.array(strongholdsZoneCountSampleSchema),
  ...deathOverlayFields,
});

export type StrongholdsEvent = z.infer<typeof strongholdsEventSchema>;
export type StrongholdsZoneEvent = z.infer<typeof strongholdsZoneEventSchema>;
export type StrongholdsZoneCountSample = z.infer<typeof strongholdsZoneCountSampleSchema>;
export type StrongholdsTimeline = z.infer<typeof strongholdsTimelineSchema>;

export const killMatrixEntrySchema = z.object({
  count: z.number().int().nonnegative().describe("Total kills for this killer/victim pair"),
  perfects: z.number().int().nonnegative().describe("Perfect medal kill count for this killer/victim pair"),
});

export type KillMatrixEntry = z.infer<typeof killMatrixEntrySchema>;

export const SUPPORTED_ANALYTICS_MODULES = ["killMatrix", "scoreProgression"] as const;
export const analyticsModuleSchema = z.enum(SUPPORTED_ANALYTICS_MODULES);
export type AnalyticsModule = z.infer<typeof analyticsModuleSchema>;

export const requestedModulesQuerySchema = z
  .string()
  .optional()
  .default("killMatrix")
  .transform((modulesRaw) => {
    return Array.from(
      new Set(
        modulesRaw
          .split(",")
          .map((module) => module.trim())
          .filter((module) => module.length > 0),
      ),
    );
  })
  .pipe(z.array(analyticsModuleSchema).min(1));

export const matchAnalyticsSchema = z.object({
  requestedModules: z.array(analyticsModuleSchema).min(1),
  killMatrix: z
    .record(
      z.string().regex(/^\d+:\d+$/, "Invalid killMatrix key format, expected <killerXuid>:<victimXuid>"),
      killMatrixEntrySchema,
    )
    .describe("Flat kill matrix keyed by <killerXuid>:<victimXuid>"),
  scoreProgression: z
    .object({
      mode: z.number().int().nonnegative(),
      durationMs: z.number().int().nonnegative(),
      teamCount: z.number().int().positive(),
      timeline: z.discriminatedUnion("type", [
        killRaceTimelineSchema,
        kothTimelineSchema,
        oddballTimelineSchema,
        strongholdsTimelineSchema,
      ]),
    })
    .nullable(),
});

export type MatchAnalytics = z.infer<typeof matchAnalyticsSchema>;
