import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import { extendToDuration } from "./extend-to-duration";
import type { ScoreProgressionPoint, ScoreProgressionTeamLine, ScoreSample } from "./types";

// Builds continuous (ramp) team lines from running-score samples: one point per sample with an
// origin and an extension to the match duration. A team missing from a sparse record carries
// its previous score forward.
export function buildSampledTeamLines(
  samples: readonly ScoreSample[],
  teamIds: readonly number[],
  teamColorByTeamId: Map<number, string>,
  durationMs: number,
): ScoreProgressionTeamLine[] {
  const inMatchSamples = samples.filter((sample) => sample.timestampMs <= durationMs);
  return teamIds.map((teamId, slotIndex) => {
    const key = String(teamId);
    const points: ScoreProgressionPoint[] = [{ timestampMs: 0, score: 0 }];
    for (const sample of inMatchSamples) {
      const previous = points.at(-1);
      const score = key in sample.runningScores ? sample.runningScores[key] : (previous?.score ?? 0);
      points.push({ timestampMs: sample.timestampMs, score });
    }
    extendToDuration(points, durationMs);
    return {
      teamId,
      name: getTeamName(teamId),
      color: teamColorByTeamId.get(teamId) ?? getTeamColorOrDefault(undefined, slotIndex).hex,
      points,
    };
  });
}
