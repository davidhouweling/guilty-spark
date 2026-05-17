import { Preconditions } from "@guilty-spark/shared/base/preconditions";

const SESSION_COOKIE_NAME = "auth-session";
const PKCE_COOKIE_NAME = "auth-pkce-state";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
const PKCE_COOKIE_MAX_AGE_SECONDS = 10 * 60;

/**
 * Session management: create, sign, validate, and serialize session tokens.
 * Uses HMAC-SHA256 for signing (not encryption; relies on HTTPS for confidentiality).
 */
export class SessionManager {
  private readonly sessionSecret: Uint8Array;

  public constructor(sessionSecretHex: string) {
    // Convert hex string to Uint8Array
    const secret = Preconditions.checkExists(sessionSecretHex, "sessionSecretHex");
    if (secret.length !== 64 || !/^[0-9a-f]+$/i.test(secret)) {
      // 32 bytes = 64 hex chars
      throw new Error("sessionSecret must be exactly 64 valid hex characters (32 bytes)");
    }

    const decodedSecret = Buffer.from(secret, "hex");
    if (decodedSecret.length !== 32) {
      throw new Error("sessionSecret must decode to exactly 32 bytes");
    }

    this.sessionSecret = new Uint8Array(decodedSecret);
  }

  /**
   * Create a signed token for an opaque value.
   * Format: value_base64.signature_base64
   */
  public async createSignedToken(value: string): Promise<string> {
    const payloadBase64 = Buffer.from(value).toString("base64");

    // HMAC-SHA256(sessionSecret, payloadBase64)
    const encoder = new TextEncoder();
    const dataToSign = encoder.encode(payloadBase64);

    const key = await crypto.subtle.importKey("raw", this.sessionSecret, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
    ]);

    const signatureBuffer = await crypto.subtle.sign("HMAC", key, dataToSign);
    const signatureBase64 = Buffer.from(signatureBuffer).toString("base64");

    return `${payloadBase64}.${signatureBase64}`;
  }

  /**
   * Verify and parse a signed token.
   * Returns the original value if valid, otherwise null.
   */
  public async validateSignedToken(token: string): Promise<string | null> {
    try {
      const [payloadBase64, signatureBase64] = token.split(".");
      if (
        typeof payloadBase64 !== "string" ||
        payloadBase64 === "" ||
        typeof signatureBase64 !== "string" ||
        signatureBase64 === ""
      ) {
        return null;
      }

      // Verify signature
      const encoder = new TextEncoder();
      const dataToVerify = encoder.encode(payloadBase64);
      const providedSignature = Buffer.from(signatureBase64, "base64");

      const key = await crypto.subtle.importKey("raw", this.sessionSecret, { name: "HMAC", hash: "SHA-256" }, false, [
        "verify",
      ]);

      const isValid = await crypto.subtle.verify("HMAC", key, providedSignature, dataToVerify);

      if (!isValid) {
        return null;
      }

      // Parse payload
      return Buffer.from(payloadBase64, "base64").toString("utf-8");
    } catch {
      return null;
    }
  }

  public setCookie(
    response: Response,
    cookieName: string,
    token: string,
    expiresAt: number,
    maxAgeSeconds = COOKIE_MAX_AGE_SECONDS,
    sameSite: "Lax" | "Strict" = "Strict",
  ): void {
    const expiresDate = new Date(expiresAt);
    const cookieValue = `${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${maxAgeSeconds.toString()}; Expires=${expiresDate.toUTCString()}`;

    response.headers.append("Set-Cookie", cookieValue);
  }

  public clearCookie(response: Response, cookieName: string, sameSite: "Lax" | "Strict" = "Strict"): void {
    const cookieValue = `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

    response.headers.append("Set-Cookie", cookieValue);
  }

  /**
   * Set a signed session token in an HttpOnly, Secure, SameSite cookie.
   */
  public setSessionCookie(response: Response, token: string, expiresAt: number): void {
    this.setCookie(response, SESSION_COOKIE_NAME, token, expiresAt);
  }

  /**
   * Clear the session cookie.
   */
  public clearSessionCookie(response: Response): void {
    this.clearCookie(response, SESSION_COOKIE_NAME);
  }

  public setPkceStateCookie(response: Response, token: string): void {
    const expiresAt = Date.now() + PKCE_COOKIE_MAX_AGE_SECONDS * 1000;
    this.setCookie(response, PKCE_COOKIE_NAME, token, expiresAt, PKCE_COOKIE_MAX_AGE_SECONDS, "Lax");
  }

  public clearPkceStateCookie(response: Response): void {
    this.clearCookie(response, PKCE_COOKIE_NAME, "Lax");
  }

  /**
   * Extract session token from request cookies.
   */
  public extractSessionToken(request: Request): string | null {
    const cookieHeader = request.headers.get("Cookie");
    if (cookieHeader == null) {
      return null;
    }

    const cookies = cookieHeader.split(";").map((c) => c.trim());
    const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));

    if (sessionCookie == null) {
      return null;
    }

    return sessionCookie.substring(`${SESSION_COOKIE_NAME}=`.length);
  }

  public extractPkceStateToken(request: Request): string | null {
    const cookieHeader = request.headers.get("Cookie");
    if (cookieHeader == null) {
      return null;
    }

    const cookies = cookieHeader.split(";").map((c) => c.trim());
    const stateCookie = cookies.find((c) => c.startsWith(`${PKCE_COOKIE_NAME}=`));

    if (stateCookie == null) {
      return null;
    }

    return stateCookie.substring(`${PKCE_COOKIE_NAME}=`.length);
  }
}
