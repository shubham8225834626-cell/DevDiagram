import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../../utils/crypto.js';

describe('Token Encrypt / Decrypt (AES-256-GCM)', () => {
  const secret = 'super-secret-encryption-key-for-tests';

  it('encrypts and decrypts plaintext roundtrip with random IVs', () => {
    const token = 'gho_example_secret_oauth_token_12345';
    const enc1 = encrypt(token, secret);
    const enc2 = encrypt(token, secret);

    expect(enc1).not.toBe(token);
    expect(enc1).not.toBe(enc2);
    expect(enc1.startsWith('v1:')).toBe(true);
    expect(decrypt(enc1, secret)).toBe(token);
    expect(decrypt(enc2, secret)).toBe(token);
  });

  it('rejects tampered ciphertext, tampered auth tag, or wrong secret', () => {
    const encrypted = encrypt('gho_sensitive_token', secret);
    const parts = encrypted.split(':');

    // Tamper ciphertext
    const tamperedCipher = [...parts];
    tamperedCipher[3] = tamperedCipher[3].slice(0, -2) + 'AA';
    expect(() => decrypt(tamperedCipher.join(':'), secret)).toThrow();

    // Tamper auth tag
    const tamperedTag = [...parts];
    tamperedTag[2] = 'A'.repeat(tamperedTag[2].length);
    expect(() => decrypt(tamperedTag.join(':'), secret)).toThrow();

    // Wrong key
    expect(() => decrypt(encrypted, 'different-secret-key')).toThrow();

    // Invalid inputs
    expect(() => encrypt('')).toThrow();
    expect(() => decrypt('invalid-format', secret)).toThrow();
  });
});
