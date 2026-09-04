import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createLeaderboard } from "../../components/leaderboard/create";
import { installLeaderboardService } from "../../services/leaderboard/install";
import type { LeaderboardService } from "../../services/leaderboard/leaderboard-types";

interface LeaderboardAppProps {
  readonly apiHost: string;
  readonly guildId: string;
  readonly queueChannelId: string | null;
}

export function LeaderboardApp({ apiHost, guildId, queueChannelId }: LeaderboardAppProps): ReactElement {
  const [loadingServices, setLoadingServices] = useState(ComponentLoaderStatus.PENDING);
  const [service, setService] = useState<LeaderboardService | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadService(): Promise<void> {
      try {
        const installedService = await installLeaderboardService(apiHost);
        if (isCancelled) {
          return;
        }
        setService(installedService);
        setLoadingServices(ComponentLoaderStatus.LOADED);
      } catch {
        if (!isCancelled) {
          setLoadingServices(ComponentLoaderStatus.ERROR);
        }
      }
    }

    void loadService();

    return (): void => {
      isCancelled = true;
    };
  }, [apiHost]);

  const LeaderboardComponent = useMemo(
    () =>
      service == null
        ? null
        : createLeaderboard({
            service,
            guildId,
            initialQueueChannelId: queueChannelId,
          }),
    [service, guildId, queueChannelId],
  );

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<LoadingState text="Loading leaderboard..." />}
      error={<ErrorState message="Failed to load leaderboard service" />}
      loaded={
        LeaderboardComponent == null ? (
          <ErrorState message="Leaderboard service failed to load" />
        ) : (
          <LeaderboardComponent />
        )
      }
    />
  );
}
