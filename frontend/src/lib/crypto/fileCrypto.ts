import { concatBytes, toArrayBuffer } from './bytes';
import type { EncryptedFileResult, EncryptedPayload } from './types';

const MAGIC = Uint8Array.from([0x4d, 0x43, 0x48, 0x31]); // "MCH1"
const IV_LENGTH = 12;

export async function encryptFile(bytes: Uint8Array): Promise<EncryptedFileResult> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const cryptoKey = await crypto.subtle.importKey('raw', toArrayBuffer(key), 'AES-GCM', false, [
    'encrypt',
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      cryptoKey,
      toArrayBuffer(bytes),
    ),
  );
  return { version: 1, algorithm: 'AES-256-GCM', key, iv, ciphertext };
}

export async function decryptFile(
  payload: Pick<EncryptedPayload, 'iv' | 'ciphertext'>,
  key: Uint8Array,
): Promise<Uint8Array> {
  if (key.length !== 32 || payload.iv.length !== IV_LENGTH) {
    throw new Error('Invalid AES-256-GCM key or IV length.');
  }
  const cryptoKey = await crypto.subtle.importKey('raw', toArrayBuffer(key), 'AES-GCM', false, [
    'decrypt',
  ]);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(payload.iv) },
      cryptoKey,
      toArrayBuffer(payload.ciphertext),
    ),
  );
}

export function serializeEncryptedPayload(payload: EncryptedPayload): Uint8Array {
  if (payload.iv.length !== IV_LENGTH) throw new Error('Invalid encrypted payload IV.');
  return concatBytes(MAGIC, payload.iv, payload.ciphertext);
}

export function parseEncryptedPayload(bytes: Uint8Array): EncryptedPayload {
  if (bytes.length <= MAGIC.length + IV_LENGTH + 16)
    throw new Error('Encrypted payload is truncated.');
  if (!MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw new Error('Unsupported encrypted payload format.');
  }
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    iv: bytes.slice(MAGIC.length, MAGIC.length + IV_LENGTH),
    ciphertext: bytes.slice(MAGIC.length + IV_LENGTH),
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes)));
  return `0x${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
