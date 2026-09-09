import crypto from 'node:crypto';

const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** @returns {string} "salt:derivedKey", both hex. */
export function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  const [saltHex, keyHex] = String(stored).split(':');
  if (!saltHex || !keyHex) return false;
  const key = crypto.scryptSync(plain, Buffer.from(saltHex, 'hex'), KEY_LENGTH, SCRYPT_PARAMS);
  const expected = Buffer.from(keyHex, 'hex');
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}
