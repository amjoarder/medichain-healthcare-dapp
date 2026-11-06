import {
  base64UrlToBytes,
  bytesToBase64Url,
  hexToBytes,
  randomBytes,
  toArrayBuffer,
} from './bytes';
import type { VaultBundle, WalletSigner } from './types';

const encoder = new TextEncoder();

export function vaultMessage(address: string): string {
  return [
    'MediChain local encryption vault v1',
    'Sign to create or unlock your local medical-record encryption key.',
    'This signature is not a blockchain transaction and is never stored.',
    `Account: ${address.toLowerCase()}`,
  ].join('\n');
}

async function deriveVaultKey(signature: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(hexToBytes(signature)),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      info: toArrayBuffer(encoder.encode('MediChain private key vault v1')),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function createVault(address: string, sign: WalletSigner): Promise<VaultBundle> {
  const signature = await sign(vaultMessage(address));
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair;
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const vaultKey = await deriveVaultKey(signature, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(iv) },
      vaultKey,
      toArrayBuffer(encoder.encode(JSON.stringify(privateKeyJwk))),
    ),
  );
  return {
    version: 1,
    algorithm: 'P-256+HKDF-SHA-256+AES-256-GCM',
    publicKeyJwk,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    encryptedPrivateKey: bytesToBase64Url(ciphertext),
  };
}

export async function unlockVault(
  vault: VaultBundle,
  address: string,
  sign: WalletSigner,
): Promise<JsonWebKey> {
  if (vault.version !== 1) throw new Error('Unsupported vault version.');
  const signature = await sign(vaultMessage(address));
  const vaultKey = await deriveVaultKey(signature, base64UrlToBytes(vault.salt));
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(base64UrlToBytes(vault.iv)) },
    vaultKey,
    toArrayBuffer(base64UrlToBytes(vault.encryptedPrivateKey)),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as JsonWebKey;
}
