import type { Contract, JsonRpcSigner } from 'ethers';
import { Building2, Stethoscope, UserRound } from 'lucide-react';
import { useState } from 'react';
import { createVault } from '../lib/crypto/vault';
import { saveVault } from '../lib/crypto/vaultStorage';

type RegistrationRole = 'patient' | 'doctor' | 'hospital';

export function Registration({
  account,
  chainId,
  signer,
  contract,
  onRegistered,
}: {
  account: string;
  chainId: number;
  signer: JsonRpcSigner;
  contract: Contract;
  onRegistered(): Promise<void>;
}) {
  const [role, setRole] = useState<RegistrationRole>('patient');
  const [fields, setFields] = useState({
    name: '',
    specialization: '',
    licenseId: '',
    registrationId: '',
  });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (name: string, value: string) =>
    setFields((current) => ({ ...current, [name]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!fields.name.trim()) return setStatus('Name is required.');
    setBusy(true);
    setStatus('Creating your local encryption vault…');
    try {
      const vault = await createVault(account, (message) => signer.signMessage(message));
      const publicKey = JSON.stringify(vault.publicKeyJwk);
      let transaction;
      if (role === 'patient') {
        transaction = await contract.registerPatient(fields.name.trim(), publicKey);
      } else if (role === 'doctor') {
        if (!fields.specialization.trim() || !fields.licenseId.trim())
          throw new Error('Specialization and license ID are required.');
        transaction = await contract.registerDoctor(
          fields.name.trim(),
          fields.specialization.trim(),
          fields.licenseId.trim(),
          publicKey,
        );
      } else {
        if (!fields.registrationId.trim()) throw new Error('Hospital registration ID is required.');
        transaction = await contract.registerHospital(
          fields.name.trim(),
          fields.registrationId.trim(),
          publicKey,
        );
      }
      setStatus('Transaction submitted. Waiting for confirmation…');
      await transaction.wait();
      saveVault(chainId, account, vault);
      setStatus(
        role === 'patient'
          ? 'Patient registration confirmed.'
          : 'Registration confirmed. Administrator approval is now required.',
      );
      await onRegistered();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="container page-section narrow">
      <div className="section-heading">
        <span className="eyebrow">Identity setup</span>
        <h1>Choose your healthcare role</h1>
        <p>One wallet can hold one system role. Use fictional demonstration details only.</p>
      </div>
      <div className="role-picker">
        {(
          [
            ['patient', UserRound, 'Patient', 'Own and share encrypted records'],
            ['doctor', Stethoscope, 'Doctor', 'Access explicitly shared records'],
            ['hospital', Building2, 'Hospital', 'Institutional, patient-authorized access'],
          ] as const
        ).map(([value, Icon, title, description]) => (
          <button
            key={value}
            type="button"
            className={`role-option ${role === value ? 'selected' : ''}`}
            onClick={() => setRole(value)}
          >
            <Icon />
            <strong>{title}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
      <form className="panel form-grid" onSubmit={submit}>
        <label className="field full">
          <span>{role === 'hospital' ? 'Institution name' : 'Full display name'}</span>
          <input
            value={fields.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder={role === 'hospital' ? 'Demonstration General Hospital' : 'Demo User'}
            required
          />
        </label>
        {role === 'doctor' && (
          <>
            <label className="field">
              <span>Specialization</span>
              <input
                value={fields.specialization}
                onChange={(event) => update('specialization', event.target.value)}
                placeholder="Cardiology"
                required
              />
            </label>
            <label className="field">
              <span>License ID</span>
              <input
                value={fields.licenseId}
                onChange={(event) => update('licenseId', event.target.value)}
                placeholder="DEMO-MED-1001"
                required
              />
            </label>
          </>
        )}
        {role === 'hospital' && (
          <label className="field full">
            <span>Institution registration ID</span>
            <input
              value={fields.registrationId}
              onChange={(event) => update('registrationId', event.target.value)}
              placeholder="DEMO-HOSP-2001"
              required
            />
          </label>
        )}
        <div className="form-footer full">
          <p className="privacy-note">
            <ShieldMini /> Your application private encryption key is encrypted locally with a
            wallet signature. It is never placed on-chain.
          </p>
          <button className="button primary" disabled={busy}>
            {busy ? 'Please confirm…' : `Register ${role}`}
          </button>
        </div>
        {status && (
          <div className="alert info full" role="status">
            {status}
          </div>
        )}
      </form>
    </section>
  );
}

function ShieldMini() {
  return <span aria-hidden="true">◆</span>;
}
