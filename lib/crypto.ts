/**
 * Symmetric encryption for provider API keys at rest (AES-256-GCM).
 *
 * The 32-byte key is derived by SHA-256 hashing of the KEY_ENCRYPTION_SECRET
 * env var. A fresh random 12-byte IV is generated per encryption.
 *
 * Stored format: `base64(iv):base64(ciphertext):base64(authTag)`.
 *
 * WARNING: Rotating KEY_ENCRYPTION_SECRET will invalidate all previously
 * stored ciphertexts. They become permanently undecryptable.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // bytes, recommended for GCM

function getKey(): Buffer {
  const secret = process.env.KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("Falta la variable de entorno: KEY_ENCRYPTION_SECRET.");
  }
  // SHA-256 always yields exactly 32 bytes -> AES-256 key.
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    ciphertext.toString("base64"),
    authTag.toString("base64"),
  ].join(":");
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Formato de ciphertext inválido.");
  }
  const [ivB64, dataB64, tagB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return plaintext.toString("utf8");
}
