export function safeRedirectPath(redirectTo: string | undefined, origin: string): string {
  if (redirectTo == null || redirectTo === "" || !redirectTo.startsWith("/")) {
    return "/";
  }

  try {
    const resolved = new URL(redirectTo, origin);
    if (resolved.origin !== origin || resolved.pathname.startsWith("//")) {
      return "/";
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}
