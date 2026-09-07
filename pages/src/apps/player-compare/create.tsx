import { useMemo } from "react";
import type { ReactElement } from "react";
import { createPlayerCompare } from "../../components/player-compare/create";

interface PlayerCompareAppProps {
  readonly apiHost: string;
  readonly gamertags: readonly string[];
}

export function PlayerCompareApp({ apiHost, gamertags }: PlayerCompareAppProps): ReactElement {
  const PlayerCompareComponent = useMemo(
    () => createPlayerCompare({ apiHost, gamertags }),
    [apiHost, gamertags],
  );

  return <PlayerCompareComponent />;
}
