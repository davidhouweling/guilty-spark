import type { ReactElement } from "react";
import { createMapCodeBuilder } from "../../components/map-code-builder/create";

const MapCodeBuilderPage = createMapCodeBuilder();

export function MapCodeBuilderApp(): ReactElement {
  return <MapCodeBuilderPage />;
}
