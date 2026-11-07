import { z } from "zod";
import { StatsValueSortBy } from "../../halo/stat-formatting";
import { trackerMatchOutcomeSchema } from "../individual-tracker/view";
import { defineContract } from "../base";

const finiteNumberSchema = z.number();
const teamIdSchema = z.number().int();

const statMetadataSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  sortBy: z.enum(StatsValueSortBy),
  isComparable: z.boolean(),
  format: z.enum(["number", "percentage", "duration-seconds", "ratio"]),
  prefix: z.string().optional(),
});

// JSON cannot encode Infinity; preserve its ratio semantics instead of clamping or rounding it.
export const statSchema = z.discriminatedUnion("status", [
  statMetadataSchema.extend({
    status: z.literal("available"),
    value: finiteNumberSchema,
  }),
  statMetadataSchema.extend({
    status: z.literal("unbounded"),
    format: z.literal("ratio"),
    numerator: finiteNumberSchema.positive(),
    denominator: z.literal(0),
  }),
  statMetadataSchema.extend({
    status: z.literal("unavailable"),
  }),
]);
export type Stat = z.infer<typeof statSchema>;

export const medalSchema = z.object({
  id: z.number().int().nonnegative().describe("Halo medal NameId / metadata nameId"),
  count: z.number().int().nonnegative(),
  name: z.string().nullable(),
  sortingWeight: finiteNumberSchema.nullable(),
  difficultyIndex: z.number().int().nonnegative().nullable(),
  difficulty: z.string().nullable().describe("Metadata difficulties[difficultyIndex], null when unavailable"),
});
export type Medal = z.infer<typeof medalSchema>;

export const teamMappingSchema = z.object({
  matchTeamId: teamIdSchema.describe("Raw TeamId for this match, independent of series side"),
  seriesTeamId: teamIdSchema.nullable().describe("Existing series side identity, null when mapping is ambiguous"),
});
export type TeamMapping = z.infer<typeof teamMappingSchema>;

export const playerTeamStatsSchema = teamMappingSchema.extend({
  stats: z.array(statSchema),
  medals: z.array(medalSchema),
});
export type PlayerTeamStats = z.infer<typeof playerTeamStatsSchema>;

export const playerSchema = z.object({
  playerId: z.string().min(1).describe("Unmodified Halo PlayerId, including bid(...) bot identities"),
  xuid: z.string().regex(/^\d+$/).optional().describe("Unwrapped numeric Xbox identity, when known"),
  discordUserId: z.string().regex(/^\d+$/).optional(),
  gamertag: z.string().nullable(),
  playerType: z.number().int(),
  lastMatchTeamId: teamIdSchema.nullable(),
  outcome: trackerMatchOutcomeSchema,
  rank: z.number().int().nonnegative().nullable(),
  participation: z.object({
    presentAtBeginning: z.boolean(),
    joinedInProgress: z.boolean(),
    leftInProgress: z.boolean(),
    presentAtCompletion: z.boolean(),
  }),
  teamStats: z.array(playerTeamStatsSchema),
});
export type Player = z.infer<typeof playerSchema>;
export const playerContract = defineContract(playerSchema);

export const teamSchema = teamMappingSchema.extend({
  name: z.string().nullable(),
  outcome: trackerMatchOutcomeSchema,
  rank: z.number().int().nonnegative().nullable(),
  playerIds: z.array(z.string().min(1)),
  stats: z.array(statSchema),
  medals: z.array(medalSchema),
});
export type Team = z.infer<typeof teamSchema>;
export const teamContract = defineContract(teamSchema);
