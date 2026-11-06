import type { Contract, JsonRpcSigner } from 'ethers';
import { catBytes, addBytes } from '../ipfs/client';
import { decryptFile, parseEncryptedPayload, sha256Hex } from '../crypto/fileCrypto';
import {
  createKeyEnvelope,
  openKeyEnvelope,
  parseKeyEnvelope,
  serializeKeyEnvelope,
} from '../crypto/envelopes';
import { loadVault } from '../crypto/vaultStorage';
import { unlockVault } from '../crypto/vault';

export interface MedicalRecordView {
  id: bigint;
  owner: string;
  recordType: string;
  encryptedFileCid: string;
  ciphertextHash: string;
  createdAt: bigint;
  exists: boolean;
}

export function recordFromContract(value: unknown): MedicalRecordView {
  const record = value as MedicalRecordView;
  return {
    id: BigInt(record.id),
    owner: record.owner,
    recordType: record.recordType,
    encryptedFileCid: record.encryptedFileCid,
    ciphertextHash: record.ciphertextHash,
    createdAt: BigInt(record.createdAt),
    exists: record.exists,
  };
}

export function envelopeContext(ciphertextHash: string, recipient: string): string {
  return `ciphertext:${ciphertextHash.toLowerCase()}:recipient:${recipient.toLowerCase()}`;
}

async function unlockLocalPrivateKey(chainId: number, account: string, signer: JsonRpcSigner) {
  const vault = loadVault(chainId, account);
  if (!vault) {
    throw new Error(
      'This browser does not contain the encryption vault for the connected account.',
    );
  }
  return unlockVault(vault, account, (message) => signer.signMessage(message));
}

export async function unwrapRecordDataKey(
  record: MedicalRecordView,
  account: string,
  chainId: number,
  signer: JsonRpcSigner,
  contract: Contract,
): Promise<Uint8Array> {
  const envelopeCid = (await contract.getEnvelopeCid(record.id)) as string;
  const envelope = parseKeyEnvelope(await catBytes(envelopeCid));
  const privateKey = await unlockLocalPrivateKey(chainId, account, signer);
  return openKeyEnvelope(envelope, privateKey, envelopeContext(record.ciphertextHash, account));
}

export async function decryptRecordBytes(
  record: MedicalRecordView,
  account: string,
  chainId: number,
  signer: JsonRpcSigner,
  contract: Contract,
): Promise<Uint8Array> {
  const key = await unwrapRecordDataKey(record, account, chainId, signer, contract);
  const encryptedBytes = await catBytes(record.encryptedFileCid);
  if ((await sha256Hex(encryptedBytes)).toLowerCase() !== record.ciphertextHash.toLowerCase()) {
    throw new Error(
      'Ciphertext integrity check failed. The retrieved IPFS bytes do not match blockchain metadata.',
    );
  }
  return decryptFile(parseEncryptedPayload(encryptedBytes), key);
}

export async function createProviderEnvelope(
  record: MedicalRecordView,
  providerAddress: string,
  ownerAddress: string,
  chainId: number,
  signer: JsonRpcSigner,
  contract: Contract,
): Promise<string> {
  const key = await unwrapRecordDataKey(record, ownerAddress, chainId, signer, contract);
  const publicKey = JSON.parse(
    (await contract.getPublicEncryptionKey(providerAddress)) as string,
  ) as JsonWebKey;
  const envelope = await createKeyEnvelope(
    key,
    publicKey,
    envelopeContext(record.ciphertextHash, providerAddress),
  );
  return (await addBytes(serializeKeyEnvelope(envelope), `record-${record.id}-key-envelope.json`))
    .cid;
}
