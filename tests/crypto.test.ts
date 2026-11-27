import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, isValidPan, isValidUpi, maskPan, maskUpi } from '../src/lib/crypto';

describe('KYC encryption', () => {
  const k = randomBytes(32);
  it('round-trips and never stores plain text', () => {
    const token = encrypt('ABCDE1234F', k);
    expect(token).not.toContain('ABCDE1234F');
    expect(decrypt(token, k)).toBe('ABCDE1234F');
  });
  it('uses a fresh IV every time', () => expect(encrypt('x@ybl', k)).not.toBe(encrypt('x@ybl', k)));
  it('rejects tampering', () => {
    const t = encrypt('aarav@okaxis', k).split(':');
    t[3] = Buffer.from('tampered').toString('base64');
    expect(() => decrypt(t.join(':'), k)).toThrow();
  });
  it('fails with the wrong key', () => expect(() => decrypt(encrypt('x', k), randomBytes(32))).toThrow());
  it('masks and validates', () => {
    expect(maskPan('ABCDE1234F')).toBe('******234F');
    expect(maskUpi('aarav@okaxis')).toBe('aa***@okaxis');
    expect(isValidPan('abcde1234f')).toBe(true);
    expect(isValidPan('ABC1234')).toBe(false);
    expect(isValidUpi('aarav.m@okaxis')).toBe(true);
    expect(isValidUpi('not a upi')).toBe(false);
  });
});
