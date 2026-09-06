import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { PlayerStatsResponse } from "@guilty-spark/shared/contracts/stats/player";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createPlayerStats } from "../../components/player-stats/create";
import { installPlayerStatsService } from "../../services/player-stats/install";
import type { PlayerStatsService } from "../../services/player-stats/player-stats-types";

interface PlayerStatsAppProps {
  readonly apiHost: string;
  readonly gamertag: string;
  readonly initialResponse?: PlayerStatsResponse | undefined;
}

export function PlayerStatsApp({ apiHost, gamertag, initialResponse }: PlayerStatsAppProps): ReactElement {
  const [loadingServices, setLoadingServices] = useState(ComponentLoaderStatus.PENDING);
  const [service, setService] = useState<PlayerStatsService | null>(null);

  useEffect(() => {
    let isCancelled = false;

    function loadService(): void {
      try {
        const installedService = installPlayerStatsService(apiHost);
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

    loadService();

    return (): void => {
      isCancelled = true;
    };
  }, [apiHost]);

  const PlayerStatsComponent = useMemo(
    () => (service == null ? null : createPlayerStats({ service, gamertag, initialResponse })),
    [service, gamertag, initialResponse],
  );

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<LoadingState text="Loading player stats..." />}
      error={<ErrorState message="Failed to load player stats service" />}
      loaded={
        PlayerStatsComponent == null ? (
          <ErrorState message="Player stats service failed to load" />
        ) : (
          <PlayerStatsComponent />
        )
      }
    />
  );
}
