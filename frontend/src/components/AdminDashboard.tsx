import type { Contract } from 'ethers';
import { Building2, CheckCircle2, Clock3, Stethoscope, UserRound, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface ProviderRow {
  address: string;
  name: string;
  detail: string;
  approved: boolean;
  role: 'Doctor' | 'Hospital';
}

export function AdminDashboard({ contract }: { contract: Contract }) {
  const [patients, setPatients] = useState<string[]>([]);
  const [providers, setProviders] = useState<ProviderRow[]>([]);
  const [recordCount, setRecordCount] = useState(0n);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const patientAddresses = (await contract.getPatientAddresses()) as string[];
    const doctorAddresses = (await contract.getDoctorAddresses()) as string[];
    const hospitalAddresses = (await contract.getHospitalAddresses()) as string[];
    const doctors = await Promise.all(
      doctorAddresses.map(async (address) => {
        const profile = await contract.getDoctorProfile(address);
        return {
          address,
          name: profile.name,
          detail: `${profile.specialization} · ${profile.licenseId}`,
          approved: profile.approved,
          role: 'Doctor' as const,
        };
      }),
    );
    const hospitals = await Promise.all(
      hospitalAddresses.map(async (address) => {
        const profile = await contract.getHospitalProfile(address);
        return {
          address,
          name: profile.name,
          detail: profile.registrationId,
          approved: profile.approved,
          role: 'Hospital' as const,
        };
      }),
    );
    setPatients(patientAddresses);
    setProviders([...doctors, ...hospitals]);
    setRecordCount(await contract.totalRecords());
  }, [contract]);

  useEffect(() => {
    void load();
  }, [load]);

  async function approve(provider: ProviderRow) {
    setBusy(provider.address);
    setStatus(`Confirm ${provider.role.toLowerCase()} approval in the administrator wallet…`);
    try {
      const transaction =
        provider.role === 'Doctor'
          ? await contract.approveDoctor(provider.address)
          : await contract.approveHospital(provider.address);
      await transaction.wait();
      setStatus(`${provider.role} approved on-chain.`);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Approval failed.');
    } finally {
      setBusy('');
    }
  }

  const pending = providers.filter((provider) => !provider.approved);
  return (
    <section className="page-section">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Administrator control center</span>
          <h1>System governance</h1>
          <p>
            Approve provider identities and inspect transparent system activity. Admin has no
            automatic plaintext record access.
          </p>
        </div>
        <span className="status secure">Admin wallet verified</span>
      </div>
      <div className="metrics-grid">
        <div className="metric-card">
          <UserRound />
          <div>
            <strong>{patients.length}</strong>
            <span>patients</span>
          </div>
        </div>
        <div className="metric-card">
          <Stethoscope />
          <div>
            <strong>{providers.filter((item) => item.role === 'Doctor').length}</strong>
            <span>doctors</span>
          </div>
        </div>
        <div className="metric-card">
          <Building2 />
          <div>
            <strong>{providers.filter((item) => item.role === 'Hospital').length}</strong>
            <span>hospitals</span>
          </div>
        </div>
        <div className="metric-card">
          <UsersRound />
          <div>
            <strong>{recordCount.toString()}</strong>
            <span>encrypted records</span>
          </div>
        </div>
      </div>
      {status && (
        <div className="alert info" role="status">
          {status}
        </div>
      )}
      <div className="panel">
        <div className="panel-title">
          <Clock3 />
          <div>
            <h2>Pending provider approvals</h2>
            <p>Approval verifies a provider role; it never grants patient-record access.</p>
          </div>
          <span className="count-badge">{pending.length}</span>
        </div>
        {pending.length === 0 ? (
          <div className="table-empty">
            <CheckCircle2 /> No pending providers
          </div>
        ) : (
          <div className="data-table">
            <div className="table-head">
              <span>Provider</span>
              <span>Credential</span>
              <span>Wallet</span>
              <span>Action</span>
            </div>
            {pending.map((provider) => (
              <div className="table-row" key={provider.address}>
                <span>
                  <strong>{provider.name}</strong>
                  <small>{provider.role}</small>
                </span>
                <span>{provider.detail}</span>
                <code>{`${provider.address.slice(0, 8)}…${provider.address.slice(-6)}`}</code>
                <button
                  className="button secondary"
                  disabled={Boolean(busy)}
                  onClick={() => void approve(provider)}
                >
                  {busy === provider.address ? 'Approving…' : 'Approve'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="panel">
        <div className="panel-title">
          <CheckCircle2 />
          <div>
            <h2>Registered providers</h2>
            <p>Current approval state read directly from the contract.</p>
          </div>
        </div>
        <div className="provider-cards">
          {providers.map((provider) => (
            <div className="provider-card" key={provider.address}>
              <div className="provider-avatar">
                {provider.role === 'Doctor' ? <Stethoscope /> : <Building2 />}
              </div>
              <div>
                <strong>{provider.name}</strong>
                <span>{provider.detail}</span>
                <code>{`${provider.address.slice(0, 10)}…${provider.address.slice(-7)}`}</code>
              </div>
              <span className={`status ${provider.approved ? 'active' : 'pending'}`}>
                {provider.approved ? 'Approved' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
