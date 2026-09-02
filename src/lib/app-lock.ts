import * as Crypto from 'expo-crypto';

// Ported from the web app's src/lib/appLock.ts. Mechanic swap: the Web
// Crypto API (crypto.getRandomValues/crypto.subtle.digest) doesn't exist on
// Hermes — expo-crypto's getRandomBytes/digestStringAsync are the RN
// equivalents, and digestStringAsync already returns a hex string directly
// (with CryptoEncoding.HEX), so the web version's manual toHex() conversion
// isn't needed for the digest — only for the raw random salt bytes.

export const PIN_LENGTH = 4;

// Re-lock if the app was backgrounded for longer than this, even within the
// same session that already unlocked once.
export const AUTO_RELOCK_MS = 2 * 60 * 1000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSalt(): string {
  return toHex(Crypto.getRandomBytes(16));
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`, { encoding: Crypto.CryptoEncoding.HEX });
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  return (await hashPin(pin, salt)) === expectedHash;
}
