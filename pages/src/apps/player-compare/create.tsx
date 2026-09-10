import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createPlayerCompare } from "../../components/player-compare/create";
import { installPlayerCompareService } from "../../services/player-compare/install";
import type { PlayerCompareService } from "../../services/player-compare/player-compare-types";

interface PlayerCompareAppProps {
  readonly apiHost: string;
  readonly gamertags: readonly string[];
}

export function PlayerCompareApp({ apiHost, gamertags }: PlayerCompareAppProps): ReactElement {
  const [loadingServices, setLoadingServices] = useState(ComponentLoaderStatus.PENDING);
  const [service, setService] = useState<PlayerCompareService | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadService(): Promise<void> {
      try {
        const installedService = await installPlayerCompareService(apiHost);
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

  const PlayerCompareComponent = useMemo(
    () => (service == null ? null : createPlayerCompare({ service, gamertags })),
    [service, gamertags],
  );

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<LoadingState text="Loading player comparison..." />}
      error={<ErrorState message="Failed to load player comparison service" />}
      loaded={
        PlayerCompareComponent == null ? (
          <ErrorState message="Player comparison service failed to load" />
        ) : (
          <PlayerCompareComponent />
        )
      }
    />
  );
}
