interface SignedMicrosoftIdTokenOptions {
  readonly clientId: string;
  readonly email?: string | undefined;
  readonly expiresAt?: number | undefined;
  readonly issuer?: string | undefined;
  readonly issuerTemplate?: string | undefined;
  readonly keyId?: string | undefined;
  readonly name?: string | undefined;
  readonly notBefore?: number | undefined;
  readonly preferredUsername?: string | undefined;
  readonly sub?: string | undefined;
  readonly tenantId?: string | undefined;
}

interface OpenIdConfigurationResponse {
  readonly issuer: string;
  readonly jwks_uri: string;
}

interface SigningJsonWebKey extends JsonWebKey {
  readonly e: string;
  readonly kid?: string;
  readonly kty: string;
  readonly n: string;
  readonly use?: string;
}

interface JwkSetResponse {
  readonly keys: readonly SigningJsonWebKey[];
}

export interface SignedMicrosoftIdToken {
  readonly jwkSet: JwkSetResponse;
  readonly openIdConfiguration: OpenIdConfigurationResponse;
  readonly token: string;
}

function isCryptoKeyPair(value: CryptoKey | CryptoKeyPair): value is CryptoKeyPair {
  return "publicKey" in value && "privateKey" in value;
}

function isSigningJsonWebKey(value: unknown): value is SigningJsonWebKey {
  return (
    typeof value === "object" &&
    value !== null &&
    "e" in value &&
    typeof value.e === "string" &&
    "kty" in value &&
    typeof value.kty === "string" &&
    "n" in value &&
    typeof value.n === "string"
  );
}

export async function aSignedMicrosoftIdTokenWith(
  options: SignedMicrosoftIdTokenOptions,
): Promise<SignedMicrosoftIdToken> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  if (!isCryptoKeyPair(keyPair)) {
    throw new Error("Expected RSA key pair");
  }

  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  if (!isSigningJsonWebKey(publicJwk)) {
    throw new Error("Expected RSA public key");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const keyId = options.keyId ?? "test-key-id";
  const tenantId = options.tenantId ?? "test-tenant-id";
  const issuer = options.issuer ?? `https://login.microsoftonline.com/${tenantId}/v2.0`;
  const issuerTemplate = options.issuerTemplate ?? issuer;
  const header = Buffer.from(
    JSON.stringify({
      alg: "RS256",
      kid: keyId,
      typ: "JWT",
    }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      aud: options.clientId,
      email: "email" in options ? options.email : "user@example.com",
      exp: options.expiresAt ?? nowSeconds + 3600,
      iss: issuer,
      name: "name" in options ? options.name : "Test User",
      nbf: options.notBefore,
      preferred_username: "preferredUsername" in options ? options.preferredUsername : "testuser",
      sub: options.sub ?? "user-123",
      tid: tenantId,
    }),
  ).toString("base64url");
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );

  return {
    token: `${header}.${payload}.${Buffer.from(signature).toString("base64url")}`,
    openIdConfiguration: {
      issuer: issuerTemplate,
      jwks_uri: "https://login.microsoftonline.com/test/discovery/v2.0/keys",
    },
    jwkSet: {
      keys: [
        {
          e: publicJwk.e,
          ext: true,
          key_ops: ["verify"],
          kid: keyId,
          kty: publicJwk.kty,
          n: publicJwk.n,
          use: "sig",
        },
      ],
    },
  };
}
