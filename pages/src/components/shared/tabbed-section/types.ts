import type { ReactNode } from "react";

export interface TabbedSectionTab<TId extends string> {
  readonly id: TId;
  readonly label: string;
  readonly content: ReactNode;
}
