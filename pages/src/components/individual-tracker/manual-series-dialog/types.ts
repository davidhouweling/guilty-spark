import type { GenerateMapsRequest } from "../../../services/individual-tracker/types";

export interface MapGeneratorOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
}

export interface ManualSeriesDialogMapGeneratorOptions {
  readonly playlistOptions: readonly MapGeneratorOption<GenerateMapsRequest["playlist"]>[];
  readonly formatOptions: readonly MapGeneratorOption<GenerateMapsRequest["format"]>[];
  readonly counts: readonly number[];
}

export interface PlannedMapRow {
  readonly index: number;
  readonly gameLabel: string;
  readonly removeLabel: string;
  readonly mode: string;
  readonly map: string;
}
