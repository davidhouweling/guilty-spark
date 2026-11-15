import { matchDetailQuerySchema } from "@guilty-spark/shared/contracts/stats/detail";
import { normalizeTrackerId } from "../stats/normalize-tracker-id";

export function getDetailQuery(matchIds: readonly string[], trackerId?: string): string {
  const parsedQuery = matchDetailQuerySchema.parse({ matchIds: matchIds.join(",") });
  const query = new URLSearchParams({ matchIds: parsedQuery.matchIds.join(",") });
  const normalizedTrackerId = normalizeTrackerId(trackerId);
  if (normalizedTrackerId != null) {
    query.set("trackerId", normalizedTrackerId);
  }
  return query.toString();
}
