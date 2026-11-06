import { base64UrlToBytes, bytesToBase64Url, randomBytes, toArrayBuffer } from './bytes';
import type { KeyEnvelope } from './types';

const encoder = new TextEncoder();

async function deriveWrappingKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey,
  salt: Uint8Array,
  context: string,
): Promise<CryptoKey> {
  const secret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: publicKey },
    privateKey,
    256,
  );
  const material = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(encoder.encode(`MediChain data-key envelope v1:${context}`)),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createKeyEnvelope(
  dataKey: Uint8Array,
  recipientPublicKey: JsonWebKey,
  context: string,
): Promise<KeyEnvelope> {
  if (dataKey.length !== 32) throw new Error('A 256-bit data key is required.');
  const recipientKey = await crypto.subtle.importKey(
    'jwk',
    recipientPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const ephemeral = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const wrappingKey = await deriveWrappingKey(ephemeral.privateKey, recipientKey, salt, context);
  const additionalData = encoder.encode(context);
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv), additionalData: toArrayBuffer(additionalData) },
      wrappingKey,
      toArrayBuffer(dataKey),
    ),
  );
  return {
    version: 1,
    algorithm: 'P-256-ECDH+HKDF-SHA-256+AES-256-GCM',
    ephemeralPublicKey: await crypto.subtle.exportKey('jwk', ephemeral.publicKey),
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    wrappedKey: bytesToBase64Url(wrapped),
  };
}

export async function openKeyEnvelope(
  envelope: KeyEnvelope,
  recipientPrivateKey: JsonWebKey,
  context: string,
): Promise<Uint8Array> {
  if (envelope.version !== 1) throw new Error('Unsupported key envelope version.');
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    recipientPrivateKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const ephemeralPublic = await crypto.subtle.importKey(
    'jwk',
    envelope.ephemeralPublicKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const wrappingKey = await deriveWrappingKey(
    privateKey,
    ephemeralPublic,
    base64UrlToBytes(envelope.salt),
    context,
  );
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: toArrayBuffer(base64UrlToBytes(envelope.iv)),
        additionalData: toArrayBuffer(encoder.encode(context)),
      },
      wrappingKey,
      toArrayBuffer(base64UrlToBytes(envelope.wrappedKey)),
    ),
  );
}

export function serializeKeyEnvelope(envelope: KeyEnvelope): Uint8Array {
  return encoder.encode(JSON.stringify(envelope));
}

export function parseKeyEnvelope(bytes: Uint8Array): KeyEnvelope {
  const envelope = JSON.parse(new TextDecoder().decode(bytes)) as KeyEnvelope;
  if (envelope.version !== 1 || envelope.algorithm !== 'P-256-ECDH+HKDF-SHA-256+AES-256-GCM') {
    throw new Error('Unsupported key envelope.');
  }
  return envelope;
}
