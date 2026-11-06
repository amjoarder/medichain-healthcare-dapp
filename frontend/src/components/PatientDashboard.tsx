import type { Contract, JsonRpcSigner } from 'ethers';
import {
  Clock3,
  Download,
  FileLock2,
  KeyRound,
  Share2,
  ShieldCheck,
  UploadCloud,
  UserMinus,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createKeyEnvelope, serializeKeyEnvelope } from '../lib/crypto/envelopes';
import { encryptFile, serializeEncryptedPayload, sha256Hex } from '../lib/crypto/fileCrypto';
import { toArrayBuffer } from '../lib/crypto/bytes';
import { loadVault } from '../lib/crypto/vaultStorage';
import { addBytes } from '../lib/ipfs/client';
import {
  createProviderEnvelope,
  decryptRecordBytes,
  envelopeContext,
  recordFromContract,
  type MedicalRecordView,
} from '../lib/records/service';

function short(value: string, start = 10, end = 7) {
  return value.length > start + end ? `${value.slice(0, start)}…${value.slice(-end)}` : value;
}

function saveBytes(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)]));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function PatientDashboard({
  account,
  chainId,
  signer,
  contract,
}: {
  account: string;
  chainId: number;
  signer: JsonRpcSigner;
  contract: Contract;
}) {
  const [records, setRecords] = useState<MedicalRecordView[]>([]);
  const [recipients, setRecipients] = useState<Record<string, string[]>>({});
  const [recordType, setRecordType] = useState('Blood Test');
  const [file, setFile] = useState<File | null>(null);
  const [providerAddress, setProviderAddress] = useState('');
  const [sharingRecord, setSharingRecord] = useState<bigint | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRecords = useCallback(async () => {
    const ids = (await contract.getPatientRecordIds()) as bigint[];
    const loaded = await Promise.all(
      ids.map(async (id) => recordFromContract(await contract.getRecord(id))),
    );
    setRecords(loaded.reverse());
    const nextRecipients: Record<string, string[]> = {};
    for (const item of loaded)
      nextRecipients[item.id.toString()] = (await contract.getPermissionRecipients(
        item.id,
      )) as string[];
    setRecipients(nextRecipients);
  }, [contract]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return setStatus('Choose a fictional demonstration file first.');
    const vault = loadVault(chainId, account);
    if (!vault)
      return setStatus(
        'Local encryption vault not found for this wallet. Register again in this browser.',
      );
    setBusy(true);
    try {
      setStatus('1/4 Encrypting medical file locally with AES-256-GCM…');
      const encrypted = await encryptFile(new Uint8Array(await file.arrayBuffer()));
      const serialized = serializeEncryptedPayload(encrypted);
      const ciphertextHash = await sha256Hex(serialized);
      setStatus('2/4 Uploading ciphertext to the local Kubo node…');
      const storedFile = await addBytes(serialized, `${file.name}.mch`);
      setStatus('3/4 Creating the patient-only encrypted data-key envelope…');
      const ownerEnvelope = await createKeyEnvelope(
        encrypted.key,
        vault.publicKeyJwk,
        envelopeContext(ciphertextHash, account),
      );
      const storedEnvelope = await addBytes(
        serializeKeyEnvelope(ownerEnvelope),
        `${file.name}.owner-key.json`,
      );
      setStatus('4/4 Recording ownership, CID, and integrity hash on-chain…');
      const transaction = await contract.addMedicalRecord(
        recordType.trim(),
        storedFile.cid,
        ciphertextHash,
        storedEnvelope.cid,
      );
      await transaction.wait();
      setStatus(`Upload confirmed. Encrypted CID: ${storedFile.cid}`);
      setFile(null);
      await loadRecords();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  async function download(record: MedicalRecordView) {
    setBusy(true);
    setStatus('Unlocking your local vault and verifying encrypted IPFS bytes…');
    try {
      const bytes = await decryptRecordBytes(record, account, chainId, signer, contract);
      saveBytes(bytes, `record-${record.id}-${record.recordType.replaceAll(' ', '_')}.bin`);
      setStatus('Integrity verified and record decrypted locally.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Record retrieval failed.');
    } finally {
      setBusy(false);
    }
  }

  async function grant(record: MedicalRecordView) {
    if (!providerAddress.trim())
      return setStatus('Enter an approved doctor or hospital wallet address.');
    setBusy(true);
    setStatus('Unlocking the owner envelope and wrapping the data key for this provider…');
    try {
      const envelopeCid = await createProviderEnvelope(
        record,
        providerAddress.trim(),
        account,
        chainId,
        signer,
        contract,
      );
      setStatus('Submitting record-level permission to the blockchain…');
      const transaction = await contract.grantPermission(
        record.id,
        providerAddress.trim(),
        envelopeCid,
      );
      await transaction.wait();
      setStatus('Permission granted and recipient key envelope recorded.');
      setProviderAddress('');
      setSharingRecord(null);
      await loadRecords();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Permission grant failed.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(record: MedicalRecordView, provider: string) {
    setBusy(true);
    setStatus('Submitting revocation…');
    try {
      const transaction = await contract.revokePermission(record.id, provider);
      await transaction.wait();
      setStatus(
        'Permission revoked. Future DApp-mediated access is now denied. Previously downloaded copies cannot be erased.',
      );
      await loadRecords();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Revocation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-section">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Patient workspace</span>
          <h1>Your medical records</h1>
          <p>
            Only encrypted bytes enter IPFS. Ownership and per-record permissions are recorded
            on-chain.
          </p>
        </div>
        <div className="metric-card compact">
          <ShieldCheck />
          <div>
            <strong>{records.length}</strong>
            <span>owned records</span>
          </div>
        </div>
      </div>
      <div className="dashboard-grid">
        <form className="panel upload-panel" onSubmit={upload}>
          <div className="panel-title">
            <UploadCloud />
            <div>
              <h2>Upload encrypted record</h2>
              <p>Use fictional demonstration data only.</p>
            </div>
          </div>
          <label className="field">
            <span>Record type</span>
            <input
              value={recordType}
              onChange={(event) => setRecordType(event.target.value)}
              required
            />
          </label>
          <label className="dropzone">
            <FileLock2 />
            <strong>{file ? file.name : 'Choose a medical file'}</strong>
            <span>
              {file
                ? `${(file.size / 1024).toFixed(1)} KiB selected`
                : 'PDF, image, or text - encrypted before upload'}
            </span>
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="button primary full-button" disabled={busy || !file}>
            {busy ? 'Working securely…' : 'Encrypt and upload'}
          </button>
        </form>
        <div className="panel security-panel">
          <div className="panel-title">
            <KeyRound />
            <div>
              <h2>How protection works</h2>
              <p>This sequence runs on every upload.</p>
            </div>
          </div>
          <ol className="security-steps">
            <li>
              <span>1</span>Fresh 256-bit file key and 96-bit IV
            </li>
            <li>
              <span>2</span>AES-GCM encryption in this browser
            </li>
            <li>
              <span>3</span>Ciphertext uploaded to local IPFS
            </li>
            <li>
              <span>4</span>CID and ciphertext hash recorded on-chain
            </li>
          </ol>
        </div>
      </div>
      {status && (
        <div className="alert info" role="status">
          {status}
        </div>
      )}
      <div className="records-heading">
        <div>
          <h2>Medical history</h2>
          <p>Newest records first. CID and hash verify the encrypted object.</p>
        </div>
      </div>
      {records.length === 0 ? (
        <div className="empty-state">
          <FileLock2 />
          <h3>No medical records yet</h3>
          <p>Your encrypted history will appear here after the first upload.</p>
        </div>
      ) : (
        <div className="record-list">
          {records.map((record) => (
            <article className="record-row" key={record.id.toString()}>
              <div className="record-primary">
                <div className="record-icon">
                  <FileLock2 />
                </div>
                <div>
                  <span className="record-id">Record #{record.id.toString()}</span>
                  <h3>{record.recordType}</h3>
                  <span className="record-date">
                    <Clock3 size={14} />{' '}
                    {new Date(Number(record.createdAt) * 1000).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="record-metadata">
                <span>
                  <small>IPFS CID</small>
                  <code title={record.encryptedFileCid}>{short(record.encryptedFileCid)}</code>
                </span>
                <span>
                  <small>Integrity hash</small>
                  <code title={record.ciphertextHash}>{short(record.ciphertextHash)}</code>
                </span>
                <span>
                  <small>Sharing</small>
                  <strong>{recipients[record.id.toString()]?.length ?? 0} active</strong>
                </span>
              </div>
              <div className="record-actions">
                <button
                  className="button ghost"
                  onClick={() => void download(record)}
                  disabled={busy}
                >
                  <Download size={16} /> Retrieve
                </button>
                <button
                  className="button secondary"
                  onClick={() => setSharingRecord(sharingRecord === record.id ? null : record.id)}
                >
                  <Share2 size={16} /> Share
                </button>
              </div>
              {sharingRecord === record.id && (
                <div className="share-drawer">
                  <div>
                    <strong>Grant record-level access</strong>
                    <p>Only an approved doctor or hospital can receive a wrapped key.</p>
                  </div>
                  <div className="share-controls">
                    <input
                      aria-label="Provider wallet address"
                      value={providerAddress}
                      onChange={(event) => setProviderAddress(event.target.value)}
                      placeholder="0x approved provider address"
                    />
                    <button
                      className="button primary"
                      onClick={() => void grant(record)}
                      disabled={busy}
                    >
                      Grant
                    </button>
                  </div>
                  {(recipients[record.id.toString()] ?? []).map((recipient) => (
                    <div className="recipient" key={recipient}>
                      <code>{short(recipient, 12, 8)}</code>
                      <span className="status active">Active</span>
                      <button
                        className="icon-button danger"
                        aria-label={`Revoke ${recipient}`}
                        onClick={() => void revoke(record, recipient)}
                        disabled={busy}
                      >
                        <UserMinus size={16} />
                      </button>
                    </div>
                  ))}
                  <p className="limitation">
                    Revocation prevents future DApp-mediated access; it cannot erase a copy already
                    downloaded by a provider.
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
