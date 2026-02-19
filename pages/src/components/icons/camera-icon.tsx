import React from "react";

export function CameraIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="1em" height="1em">
      {/* Monitor body shell - top */}
      <path vectorEffect="non-scaling-stroke" strokeWidth="1.5" d="M7 6.5C7 3 17 3 17 6.5" />

      {/* Monitor body shell - bottom */}
      <path vectorEffect="non-scaling-stroke" strokeWidth="1.5" d="M7 17.5C7 21 17 21 17 17.5" />

      {/* Main spherical body */}
      <circle cx="12" cy="12" r="6.5" strokeWidth="1.5" />

      {/* Central Eye (The "Camera") */}
      <circle cx="12" cy="12" r="2.5" fill="currentColor" fillOpacity="0.2" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />

      {/* Side details (wings/fins) */}
      <path strokeWidth="1" d="M5.5 12L4 12" opacity="0.6" />
      <path strokeWidth="1" d="M20 12L18.5 12" opacity="0.6" />

      {/* Scan Beam Effect (conical scan from eye) */}
      <path d="M15 12L22 8M15 12L22 16" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
      <path d="M22 8Q23 12 22 16" strokeWidth="1" opacity="0.3" />
    </svg>
  );
}
