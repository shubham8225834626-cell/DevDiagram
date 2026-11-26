import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PREFIX = 'v1';

function deriveKey(overrideSecret) {
  const secret =
    overrideSecret ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.AUTH_SECRET ||
    process.env.LLM_API_KEY ||
    'devdiagram-local-secret';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 */
export function encrypt(plaintext, overrideSecret) {
  if (typeof plaintext !== 'string' || !plaintext) {
    throw new Error('encrypt requires a non-empty string');
  }
  const key = deriveKey(overrideSecret);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':');
}

/**
 * Decrypt a payload produced by encrypt() using AES-256-GCM.
 * Throws if tampered, malformed, or wrong secret.
 */
export function decrypt(payload, overrideSecret) {
  if (typeof payload !== 'string' || !payload) {
    throw new Error('decrypt requires a non-empty encrypted string');
  }
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error('Invalid encrypted token format');
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const key = deriveKey(overrideSecret);
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const ciphertext = Buffer.from(dataB64, 'base64url');

  if (iv.length !== IV_LENGTH || tag.length !== 16) {
    throw new Error('Invalid IV or auth tag length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}
