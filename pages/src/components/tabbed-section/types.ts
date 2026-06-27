import type { ReactNode } from "react";

export interface TabbedSectionTab<TId extends string> {
  readonly id: TId;
  readonly label: NonNullable<ReactNode>;
  readonly content: ReactNode;
}
