import { Preconditions } from "@guilty-spark/shared/base/preconditions";

const ENCRYPTED_TOKEN_PREFIX = "enc-v1";
const IV_LENGTH_BYTES = 12;

export class TokenEncryptor {
  private readonly encryptionSecret: Uint8Array;

  public constructor(encryptionSecretHex: string) {
    const secret = Preconditions.checkExists(encryptionSecretHex, "encryptionSecretHex");
    if (secret.length !== 64 || !/^[0-9a-f]+$/i.test(secret)) {
      throw new Error("tokenEncryptionSecret must be exactly 64 valid hex characters (32 bytes)");
    }

    const decodedSecret = Buffer.from(secret, "hex");
    if (decodedSecret.length !== 32) {
      throw new Error("tokenEncryptionSecret must decode to exactly 32 bytes");
    }

    this.encryptionSecret = new Uint8Array(decodedSecret);
  }

  public async encrypt(token: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
    const key = await this.importKey();
    const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token));

    return `${ENCRYPTED_TOKEN_PREFIX}.${Buffer.from(iv).toString("base64")}.${Buffer.from(cipherBuffer).toString("base64")}`;
  }

  public async decrypt(token: string): Promise<string> {
    if (!token.startsWith(`${ENCRYPTED_TOKEN_PREFIX}.`)) {
      return token;
    }

    const [, ivBase64, cipherBase64] = token.split(".");
    if (ivBase64 == null || cipherBase64 == null) {
      throw new Error("Encrypted token payload is malformed");
    }

    const key = await this.importKey();
    const plainBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: Buffer.from(ivBase64, "base64") },
      key,
      Buffer.from(cipherBase64, "base64"),
    );

    return Buffer.from(plainBuffer).toString("utf-8");
  }

  private async importKey(): Promise<CryptoKey> {
    return await crypto.subtle.importKey("raw", this.encryptionSecret, { name: "AES-GCM" }, false, [
      "encrypt",
      "decrypt",
    ]);
  }
}
