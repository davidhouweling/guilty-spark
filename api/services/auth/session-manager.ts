import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { SessionTokenPayload, AuthSession } from "./types";

const SESSION_COOKIE_NAME = "auth-session";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Session management: create, sign, validate, and serialize session tokens.
 * Uses HMAC-SHA256 for signing (not encryption; relies on HTTPS for confidentiality).
 */
export class SessionManager {
  private readonly sessionSecret: Uint8Array;

  public constructor(sessionSecretHex: string) {
    // Convert hex string to Uint8Array
    const secret = Preconditions.checkExists(sessionSecretHex, "sessionSecretHex");
    if (secret.length !== 64) {
      // 32 bytes = 64 hex chars
      throw new Error(`sessionSecret must be 64 hex characters (32 bytes), got ${secret.length.toString()}`);
    }

    this.sessionSecret = new Uint8Array(Buffer.from(secret, "hex"));
  }

  /**
   * Create a signed session token from a payload.
   * Format: payload_base64.signature_base64
   */
  public async createSessionToken(payload: SessionTokenPayload): Promise<string> {
    const payloadJson = JSON.stringify(payload);
    const payloadBase64 = Buffer.from(payloadJson).toString("base64");

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
   * Verify and parse a signed session token.
   * Returns null if invalid/expired.
   */
  public async validateSessionToken(token: string): Promise<AuthSession | null> {
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
      const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf-8");
      const payload = JSON.parse(payloadJson) as SessionTokenPayload;

      // Check expiry
      const now = Date.now();
      const isExpired = payload.expiresAt < now;

      return {
        userId: payload.userId,
        accessToken: payload.accessToken,
        refreshToken: payload.refreshToken,
        expiresAt: payload.expiresAt,
        isExpired,
      };
    } catch {
      return null;
    }
  }

  /**
   * Set a signed session token in an HttpOnly, Secure, SameSite cookie.
   */
  public setSessionCookie(response: Response, token: string, expiresAt: number): void {
    const expiresDate = new Date(expiresAt);

    const cookieValue = `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SECONDS.toString()}; Expires=${expiresDate.toUTCString()}`;

    response.headers.append("Set-Cookie", cookieValue);
  }

  /**
   * Clear the session cookie.
   */
  public clearSessionCookie(response: Response): void {
    const cookieValue = `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;

    response.headers.append("Set-Cookie", cookieValue);
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
}
