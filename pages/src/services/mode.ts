export type PagesMode = "REAL" | "FAKE";

export function getMode(): PagesMode {
  const mode = import.meta.env.MODE;
  const normalized = mode.toLowerCase();
  return normalized === "fake" || normalized === "test" ? "FAKE" : "REAL";
}
