// AES-256-GCM for PAN and UPI IDs. Server-side only.
// REELAY_DATA_KEY must be 32 bytes, base64-encoded. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const raw = process.env.REELAY_DATA_KEY;
  if (!raw) throw new Error('REELAY_DATA_KEY is not set');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('REELAY_DATA_KEY must be 32 bytes (base64)');
  return k;
}

/** Returns "v1:<iv>:<tag>:<ciphertext>", all base64. */
export function encrypt(plain: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

export function decrypt(token: string, k: Buffer = key()): string {
  const [v, iv, tag, data] = token.split(':');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unrecognised encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export const maskPan = (pan: string) => '******' + pan.slice(-4).toUpperCase();
export const maskUpi = (upi: string) => upi.replace(/^(.{2}).*(@.+)$/, '$1***$2');
export const isValidPan = (pan: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.toUpperCase());
export const isValidUpi = (upi: string) => /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/.test(upi);
