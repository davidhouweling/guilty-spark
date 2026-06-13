import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import { DiscordSeriesStatsPresenter } from "./discord-series-stats-presenter";
import { DiscordSeriesStatsView } from "./discord-series-stats-view";

interface DiscordSeriesStatsProps {
  readonly data: DiscordSeriesStatsResolved;
  readonly matchAnalyticsService: MatchAnalyticsService;
}

export function DiscordSeriesStats({ data, matchAnalyticsService }: DiscordSeriesStatsProps): ReactElement {
  const presenter = useMemo(() => new DiscordSeriesStatsPresenter(data.renderData), [data]);

  const model = useMemo(() => presenter.present(), [presenter]);

  const [analyticsByMatchId, setAnalyticsByMatchId] = useState<ReadonlyMap<string, MatchAnalytics>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const {matchIds} = data;

    void Promise.all(
      matchIds.map(async (matchId) => {
        try {
          const analytics = await matchAnalyticsService.getMatchAnalytics(matchId);
          return { matchId, analytics };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }
      const map = new Map<string, MatchAnalytics>();
      for (const result of results) {
        if (result != null) {
          map.set(result.matchId, result.analytics);
        }
      }
      setAnalyticsByMatchId(map);
    });

    return (): void => {
      cancelled = true;
    };
  }, [data.matchIds, matchAnalyticsService]);

  return <DiscordSeriesStatsView renderData={data.renderData} model={model} analyticsByMatchId={analyticsByMatchId} />;
}
