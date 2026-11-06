export interface EncryptedPayload {
  version: 1;
  algorithm: 'AES-256-GCM';
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

export interface EncryptedFileResult extends EncryptedPayload {
  key: Uint8Array;
}

export interface VaultBundle {
  version: 1;
  algorithm: 'P-256+HKDF-SHA-256+AES-256-GCM';
  publicKeyJwk: JsonWebKey;
  salt: string;
  iv: string;
  encryptedPrivateKey: string;
}

export interface KeyEnvelope {
  version: 1;
  algorithm: 'P-256-ECDH+HKDF-SHA-256+AES-256-GCM';
  ephemeralPublicKey: JsonWebKey;
  salt: string;
  iv: string;
  wrappedKey: string;
}

export type WalletSigner = (message: string) => Promise<string>;
