import React from "react";
import { Checkbox } from "../../../checkbox/checkbox";
import { PLAYER_ADVANTAGE_SERIES } from "../chart-constants";

interface PlayerAdvantageToggleProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function PlayerAdvantageToggle({ checked, onChange }: PlayerAdvantageToggleProps): React.ReactElement {
  return <Checkbox checked={checked} onChange={onChange} label={PLAYER_ADVANTAGE_SERIES} />;
}
