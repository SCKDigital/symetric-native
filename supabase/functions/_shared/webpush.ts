export const VAPID_PUBLIC_KEY =
  'BHt8nsRbf5dU9E5L1syC---yn3gje-awu8IwAngYeH_vLLqtUF4qh4hA88P4X-vC6j4g7_eALwpzCjt5Ab_AJeQ';

export function b64u(str: string): Uint8Array {
  const pad = '='.repeat((4 - (str.length % 4)) % 4);
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const raw = atob(b64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function toB64u(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

export function vapidPublicKeyToJwkXY(pubKeyB64u: string): { x: string; y: string } {
  const raw = b64u(pubKeyB64u);
  if (raw[0] !== 0x04 || raw.length !== 65) {
    throw new Error(`VAPID public key must be a 65-byte uncompressed P-256 point (got ${raw.length} bytes, first byte 0x${raw[0].toString(16)})`);
  }
  return { x: toB64u(raw.slice(1, 33)), y: toB64u(raw.slice(33, 65)) };
}

export async function buildVapidJwt(
  audience: string,
  privateKeyB64u: string,
  contactEmail: string,
): Promise<string> {
  const header = toB64u(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const claims = toB64u(new TextEncoder().encode(JSON.stringify({ aud: audience, exp, sub: contactEmail })));
  const sigInput = `${header}.${claims}`;
  const { x, y } = vapidPublicKeyToJwkXY(VAPID_PUBLIC_KEY);
  const privKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: privateKeyB64u.trim(), x, y, key_ops: ['sign'], ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privKey,
    new TextEncoder().encode(sigInput),
  );
  return `${sigInput}.${toB64u(sig)}`;
}

export async function encryptPayload(
  plaintext: string,
  p256dhB64u: string,
  authB64u: string,
): Promise<Uint8Array> {
  const recipientPublicKey = await crypto.subtle.importKey(
    'raw', b64u(p256dhB64u), { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const senderKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits'],
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: recipientPublicKey }, senderKeyPair.privateKey, 256,
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const authSecret = b64u(authB64u);
  const senderPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', senderKeyPair.publicKey));

  const hkdfKey = async (ikm: Uint8Array, salt2: Uint8Array, info: Uint8Array, len: number) => {
    const rawKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: salt2, info }, rawKey, len * 8,
    ));
  };

  const prk = await hkdfKey(
    new Uint8Array(sharedBits), authSecret,
    concat(new TextEncoder().encode('WebPush: info\x00'), b64u(p256dhB64u), senderPubRaw), 32,
  );
  const cek = await hkdfKey(prk, salt, concat(new TextEncoder().encode('Content-Encoding: aes128gcm\x00')), 16);
  const nonce = await hkdfKey(prk, salt, concat(new TextEncoder().encode('Content-Encoding: nonce\x00')), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const paddedPlain = new Uint8Array([...new TextEncoder().encode(plaintext), 0x02]);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, paddedPlain));

  const rs = 4096;
  const rsBytes = new Uint8Array([(rs >> 24) & 0xff, (rs >> 16) & 0xff, (rs >> 8) & 0xff, rs & 0xff]);
  return concat(salt, rsBytes, new Uint8Array([senderPubRaw.length]), senderPubRaw, ciphertext);
}

export async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string,
  vapidPrivateKey: string,
  contactEmail: string,
): Promise<Response> {
  const url = new URL(subscription.endpoint);
  const jwt = await buildVapidJwt(`${url.protocol}//${url.host}`, vapidPrivateKey, contactEmail);
  const body = await encryptPayload(payload, subscription.p256dh, subscription.auth);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '300',
      'Urgency': 'high',
      'Authorization': `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
    },
    body,
  });
}
