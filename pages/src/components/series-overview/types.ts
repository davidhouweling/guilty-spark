export interface SeriesOverviewPlayer {
  readonly id: string;
  readonly discordName: string;
  readonly gamertag: string | null;
}

export interface SeriesOverviewTeam {
  readonly id: string;
  readonly name: string;
  readonly teamColorHex: string;
  readonly players: readonly SeriesOverviewPlayer[];
}

export interface SeriesOverviewMatch {
  readonly id: string;
  readonly href?: string | undefined;
  readonly mapBackgroundUrl: string;
  readonly teamColorHex?: string | undefined;
  readonly gameModeIconUrl: string | null;
  readonly gameModeAlt: string;
  readonly score: string | null;
  readonly subScore: string | null;
  readonly mapLabel: string;
  readonly isUpcoming: boolean;
}

export interface SeriesOverviewProps {
  readonly score: string;
  readonly matches: readonly SeriesOverviewMatch[];
  readonly teams: readonly SeriesOverviewTeam[];
  readonly waitingMessage?: string | undefined;
}
