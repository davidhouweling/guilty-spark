export interface SeriesTab {
  readonly type: "series";
  readonly seriesId: string;
  readonly index: number;
  readonly label: string;
  readonly score: string;
  readonly teamColor: string | undefined;
  readonly icons?: readonly { readonly src: string; readonly dimmed: boolean }[];
}

interface MatchTabBase {
  readonly type: "match";
  readonly index: number;
  readonly matchId: string;
  readonly label: string;
  readonly score: string;
  readonly teamColor: string | undefined;
}

type SingleIconMatchTab = MatchTabBase & { readonly icon: string; readonly icons?: never };
type MultiIconMatchTab = MatchTabBase & {
  readonly icons: readonly { readonly src: string; readonly dimmed: boolean }[];
  readonly icon?: never;
};

export type MatchTab = SingleIconMatchTab | MultiIconMatchTab;

export interface UpcomingTab {
  readonly type: "upcoming";
  readonly index: number;
  readonly label: string;
  readonly icons: readonly { readonly src: string; readonly dimmed: boolean }[];
}

export type OverlayTab = SeriesTab | MatchTab | UpcomingTab;