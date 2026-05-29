/**
 * Returns a safe, same-origin redirect path, or "/" when the input could send the user
 * to another origin.
 *
 * Resolves against `origin` (a placeholder origin works server-side: any cross-origin
 * escape changes the origin away from it) and additionally rejects a resolved pathname
 * that begins with "//". Such a pathname is treated as protocol-relative — and therefore
 * off-origin — when it is later re-resolved by `new URL(path, base)` or
 * `location.assign(path)`, so returning it would re-open the redirect. Inputs like
 * `/..//evil.com` and `/.//evil.com` resolve to pathname `//evil.com` and are caught here.
 */
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
