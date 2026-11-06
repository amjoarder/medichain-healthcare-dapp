import type { Contract, EventLog } from 'ethers';
import {
  Activity,
  FilePlus2,
  KeyRound,
  ShieldCheck,
  UserPlus2,
  UserRoundCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import contractConfig from '../generated/contract.json';

interface AuditItem {
  key: string;
  name: string;
  block: number;
  transactionHash: string;
  summary: string;
}

const eventNames = [
  'PatientRegistered',
  'DoctorRegistered',
  'DoctorApproved',
  'HospitalRegistered',
  'HospitalApproved',
  'MedicalRecordAdded',
  'PermissionGranted',
  'PermissionRevoked',
  'RecordAccessed',
] as const;

function iconFor(name: string) {
  if (name.includes('Registered')) return <UserPlus2 />;
  if (name.includes('Approved')) return <UserRoundCheck />;
  if (name === 'MedicalRecordAdded') return <FilePlus2 />;
  if (name.includes('Permission')) return <KeyRound />;
  return <ShieldCheck />;
}

function summarize(log: EventLog): string {
  const args = log.args;
  if (log.eventName === 'RecordAccessed')
    return `DApp-mediated access to record #${args[0]} by ${args[2]}`;
  if (log.eventName === 'PermissionGranted') return `Record #${args[0]} shared with ${args[2]}`;
  if (log.eventName === 'PermissionRevoked') return `Record #${args[0]} revoked from ${args[2]}`;
  if (log.eventName === 'MedicalRecordAdded')
    return `Encrypted record #${args[0]} added by ${args[1]}`;
  return `${log.eventName.replace(/([A-Z])/gu, ' $1').trim()} · ${args[0]}`;
}

export function AuditLog({ contract }: { contract: Contract }) {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [status, setStatus] = useState('Loading blockchain events…');

  const load = useCallback(async () => {
    try {
      const groups = await Promise.all(
        eventNames.map(async (name) =>
          contract.queryFilter(contract.filters[name](), contractConfig.deploymentBlock),
        ),
      );
      const logs = groups
        .flat()
        .filter((log): log is EventLog => 'eventName' in log)
        .sort((a, b) => b.blockNumber - a.blockNumber || b.index - a.index);
      setItems(
        logs.map((log) => ({
          key: `${log.transactionHash}:${log.index}`,
          name: log.eventName,
          block: log.blockNumber,
          transactionHash: log.transactionHash,
          summary: summarize(log),
        })),
      );
      setStatus('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load audit events.');
    }
  }, [contract]);

  useEffect(() => {
    void load();
  }, [load]);
  return (
    <section className="page-section">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Immutable event history</span>
          <h1>Audit activity</h1>
          <p>Important DApp actions recorded by the local Ethereum contract.</p>
        </div>
        <button className="button ghost" onClick={() => void load()}>
          <Activity size={16} /> Refresh
        </button>
      </div>
      <div className="alert warning">
        <strong>Accurate audit boundary:</strong> “Record accessed” means a signed DApp-mediated
        access. Ethereum cannot detect someone retrieving a known CID directly from IPFS.
      </div>
      {status && <div className="alert info">{status}</div>}
      <div className="timeline">
        {items.map((item) => (
          <article className="timeline-item" key={item.key}>
            <div className="timeline-icon">{iconFor(item.name)}</div>
            <div>
              <span className="event-name">{item.name.replace(/([A-Z])/gu, ' $1').trim()}</span>
              <p>{item.summary}</p>
              <small>
                Block {item.block} ·{' '}
                <code>{`${item.transactionHash.slice(0, 12)}…${item.transactionHash.slice(-8)}`}</code>
              </small>
            </div>
          </article>
        ))}
        {!status && items.length === 0 && (
          <div className="empty-state">
            <Activity />
            <h3>No events yet</h3>
            <p>Registrations and record actions will appear here.</p>
          </div>
        )}
      </div>
    </section>
  );
}
