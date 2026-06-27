import type { ReactNode } from "react";

export type TabbedSectionLabel = Exclude<ReactNode, boolean | null | undefined>;

export interface TabbedSectionTab<TId extends string> {
  readonly id: TId;
  readonly label: TabbedSectionLabel;
  readonly content: ReactNode;
}
