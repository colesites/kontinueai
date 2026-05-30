// AES-GCM encryption helpers for connector OAuth tokens.
//
// Tokens are encrypted at rest using CONNECTOR_ENCRYPTION_KEY (a base64-encoded
// 32-byte key set in the Convex environment). The stored value is
// base64(iv[12] || ciphertext+tag). These run in the Convex default runtime,
// which exposes the Web Crypto `crypto.subtle` API — no "use node" required.

const IV_BYTES = 12;

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

async function importKey(): Promise<CryptoKey> {
  const raw = process.env.CONNECTOR_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CONNECTOR_ENCRYPTION_KEY is not set — cannot encrypt connector tokens.",
    );
  }
  const keyBytes = base64ToBytes(raw);
  if (keyBytes.length !== 32) {
    throw new Error("CONNECTOR_ENCRYPTION_KEY must decode to 32 bytes (AES-256).");
  }
  return crypto.subtle.importKey("raw", keyBytes as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await importKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoded as BufferSource,
  );
  const cipherBytes = new Uint8Array(cipher);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return bytesToBase64(combined);
}

export async function decryptToken(encoded: string): Promise<string> {
  const key = await importKey();
  const combined = base64ToBytes(encoded);
  const iv = combined.slice(0, IV_BYTES);
  const cipherBytes = combined.slice(IV_BYTES);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    cipherBytes as BufferSource,
  );
  return new TextDecoder().decode(plain);
}
