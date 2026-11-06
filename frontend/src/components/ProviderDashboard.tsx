import type { Contract, JsonRpcSigner } from 'ethers';
import {
  Clock3,
  Download,
  FileLock2,
  Hourglass,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  decryptRecordBytes,
  recordFromContract,
  type MedicalRecordView,
} from '../lib/records/service';
import { toArrayBuffer } from '../lib/crypto/bytes';

function saveBytes(bytes: Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([toArrayBuffer(bytes)]));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ProviderDashboard({
  role,
  account,
  chainId,
  signer,
  contract,
}: {
  role: 2 | 3;
  account: string;
  chainId: number;
  signer: JsonRpcSigner;
  contract: Contract;
}) {
  const [approved, setApproved] = useState(false);
  const [records, setRecords] = useState<MedicalRecordView[]>([]);
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState<bigint | null>(null);

  const load = useCallback(async () => {
    const profile =
      role === 2
        ? await contract.getDoctorProfile(account)
        : await contract.getHospitalProfile(account);
    setApproved(Boolean(profile.approved));
    if (!profile.approved) return setRecords([]);
    const ids = (await contract.getProviderRecordIds()) as bigint[];
    const current: MedicalRecordView[] = [];
    for (const id of ids) {
      if (await contract.hasAccess(id, account))
        current.push(recordFromContract(await contract.getRecord(id)));
    }
    setRecords(current.reverse());
  }, [account, contract, role]);

  useEffect(() => {
    void load();
  }, [load]);

  async function access(record: MedicalRecordView) {
    setBusyId(record.id);
    setStatus('Confirm the DApp-mediated access audit transaction in your wallet…');
    try {
      if (!(await contract.hasAccess(record.id, account)))
        throw new Error('Current blockchain permission is not active.');
      const auditTransaction = await contract.logRecordAccess(record.id);
      await auditTransaction.wait();
      setStatus('Access logged. Unlocking recipient key envelope and verifying ciphertext…');
      const bytes = await decryptRecordBytes(record, account, chainId, signer, contract);
      saveBytes(bytes, `authorized-record-${record.id}.bin`);
      setStatus('Authorized record decrypted locally. The DApp-mediated access event is on-chain.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Access failed.');
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!approved)
    return (
      <section className="page-section narrow">
        <div className="empty-state pending">
          <Hourglass />
          <h1>Approval pending</h1>
          <p>
            Your {role === 2 ? 'doctor' : 'hospital'} profile is registered, but an administrator
            must approve it before a patient can grant access.
          </p>
          <span className="status pending">Pending administrator review</span>
        </div>
      </section>
    );

  return (
    <section className="page-section">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">{role === 2 ? 'Doctor' : 'Hospital'} workspace</span>
          <h1>Shared medical records</h1>
          <p>Only records with a current patient grant appear here.</p>
        </div>
        <div className="metric-card compact">
          <Stethoscope />
          <div>
            <strong>{records.length}</strong>
            <span>authorized records</span>
          </div>
        </div>
      </div>
      {status && (
        <div className="alert info" role="status">
          {status}
        </div>
      )}
      {records.length === 0 ? (
        <div className="empty-state">
          <ShieldAlert />
          <h3>No active record permissions</h3>
          <p>Ask a patient to grant this wallet access to an individual record.</p>
        </div>
      ) : (
        <div className="record-list">
          {records.map((record) => (
            <article className="record-row provider-row" key={record.id.toString()}>
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
                  <small>Patient owner</small>
                  <code>{`${record.owner.slice(0, 10)}…${record.owner.slice(-7)}`}</code>
                </span>
                <span>
                  <small>Permission</small>
                  <strong className="inline-secure">
                    <ShieldCheck size={14} /> Active on-chain
                  </strong>
                </span>
              </div>
              <button
                className="button primary"
                onClick={() => void access(record)}
                disabled={busyId !== null}
              >
                <Download size={16} /> {busyId === record.id ? 'Unlocking…' : 'Audit & decrypt'}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
