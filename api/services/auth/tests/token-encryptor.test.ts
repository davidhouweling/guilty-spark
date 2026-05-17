import { describe, expect, it } from "vitest";
import { TokenEncryptor } from "../token-encryptor";

describe("TokenEncryptor", () => {
  it("encrypts and decrypts a token", async () => {
    const encryptor = new TokenEncryptor("a".repeat(64));

    const encryptedToken = await encryptor.encrypt("access-token");

    expect(encryptedToken).toContain("enc-v1.");
    expect(encryptedToken).not.toContain("access-token");
    await expect(encryptor.decrypt(encryptedToken)).resolves.toBe("access-token");
  });

  it("returns plaintext tokens unchanged for backwards compatibility", async () => {
    const encryptor = new TokenEncryptor("b".repeat(64));

    await expect(encryptor.decrypt("legacy-token")).resolves.toBe("legacy-token");
  });

  it("throws on encryption secrets with the wrong length", () => {
    expect(() => new TokenEncryptor("invalid-secret")).toThrow(
      "tokenEncryptionSecret must be exactly 64 characters (32 bytes encoded as hex)",
    );
  });

  it("throws on encryption secrets with invalid hex characters", () => {
    expect(() => new TokenEncryptor("z".repeat(64))).toThrow(
      "tokenEncryptionSecret must contain only hexadecimal characters",
    );
  });
});
