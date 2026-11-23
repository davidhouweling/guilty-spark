import { z } from "zod";
import { createApiUrl } from "../api-url";
import type { DiscordSeriesStatsLookupResult } from "../stats/discord-series-types";

export const trackerStatusSchema = z.object({
  state: z.object({ status: z.enum(["active", "paused", "stopped"]) }),
});

export type SeriesSource =
  | { readonly source: "live" }
  | { readonly source: "archive"; readonly lookup: DiscordSeriesStatsLookupResult }
  | { readonly source: "error"; readonly status: number };

export async function resolveSeriesSource(
  apiHost: string,
  guildId: string,
  queueNumber: string,
  lookupArchive: () => Promise<DiscordSeriesStatsLookupResult>,
): Promise<SeriesSource> {
  const url = createApiUrl(apiHost, `/tracker/${guildId}/${queueNumber}/status`);
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (response.status === 404) {
    return { source: "archive", lookup: await lookupArchive() };
  }
  if (response.status !== 200) {
    return { source: "error", status: response.status >= 400 ? response.status : 502 };
  }
  const { state } = trackerStatusSchema.parse(await response.json());
  if (state.status === "stopped") {
    return { source: "archive", lookup: await lookupArchive() };
  }
  return { source: "live" };
}
