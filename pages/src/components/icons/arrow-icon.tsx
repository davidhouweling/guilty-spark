import type { ReactElement } from "react";
export function ArrowIcon({ direction }: { readonly direction: "up" | "down" }): ReactElement {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={direction === "up" ? "m6 10 6-6 6 6M12 4v16" : "m6 14 6 6 6-6M12 20V4"} />
    </svg>
  );
}
