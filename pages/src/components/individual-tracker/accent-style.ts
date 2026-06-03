import type React from "react";

export function accentStyle(colorHex: string | undefined): React.CSSProperties | undefined {
  return colorHex == null ? undefined : { borderLeftColor: colorHex };
}
