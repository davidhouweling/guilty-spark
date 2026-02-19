import React from "react";

export function CameraIcon(): React.ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="1em" height="1em">
      {/* Video camera body */}
      <rect x="2" y="8" width="13" height="8" rx="1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Lens */}
      <circle cx="7" cy="12" r="2.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Lens inner detail */}
      <circle cx="7" cy="12" r="1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Viewfinder screen on top */}
      <path d="M11 8V6a1 1 0 011-1h3a1 1 0 011 1v2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Recording triangles (right side) */}
      <path d="M15 10l5 2-5 2V10z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Recording indicator dot */}
      <circle cx="12" cy="10" r="0.5" fill="currentColor" />
    </svg>
  );
}
