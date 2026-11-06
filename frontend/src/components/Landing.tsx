import { ArrowRight, DatabaseZap, FileKey2, Fingerprint, ShieldCheck } from 'lucide-react';

export function Landing({
  connect,
  connecting,
  error,
}: {
  connect(): void;
  connecting: boolean;
  error: string;
}) {
  return (
    <main>
      <section className="hero container">
        <div className="hero-copy">
          <span className="eyebrow">
            <ShieldCheck size={16} /> Local-first. Patient-controlled. Auditable.
          </span>
          <h1>Blockchain-Based Healthcare Data Sharing</h1>
          <p className="hero-lead">
            A zero-cost healthcare DApp where patients encrypt records locally, store ciphertext in
            IPFS, and control record-level access through transparent blockchain permissions.
          </p>
          <div className="hero-actions">
            <button className="button primary large" onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Connect wallet'} <ArrowRight size={18} />
            </button>
            <span className="network-chip">
              <span className="pulse" /> Hardhat local network
            </span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
        </div>
        <div className="hero-visual" aria-label="Encrypted record sharing overview">
          <div className="visual-orbit orbit-one" />
          <div className="visual-orbit orbit-two" />
          <div className="record-card floating">
            <div className="record-icon">
              <FileKey2 />
            </div>
            <div>
              <small>Encrypted record</small>
              <strong>Blood Test Report</strong>
            </div>
            <span className="status secure">AES-256-GCM</span>
          </div>
          <div className="permission-card">
            <Fingerprint size={19} />
            <span>Patient granted access</span>
          </div>
          <div className="chain-card">
            <DatabaseZap size={19} />
            <span>Permission confirmed on-chain</span>
          </div>
        </div>
      </section>
      <section className="container feature-grid" aria-label="System benefits">
        <article>
          <FileKey2 />
          <h2>Encrypted before storage</h2>
          <p>Medical bytes are protected in your browser before local IPFS receives them.</p>
        </article>
        <article>
          <Fingerprint />
          <h2>Patient-owned permissions</h2>
          <p>Every grant and revoke is record-specific and enforced by the smart contract.</p>
        </article>
        <article>
          <DatabaseZap />
          <h2>Content-addressed records</h2>
          <p>
            Actual CIDs and integrity hashes connect encrypted IPFS data to blockchain metadata.
          </p>
        </article>
        <article>
          <ShieldCheck />
          <h2>Transparent auditability</h2>
          <p>
            Registrations, approvals, sharing, revocation, and DApp-mediated access are
            event-backed.
          </p>
        </article>
      </section>
    </main>
  );
}
