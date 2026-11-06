import {
  Activity,
  BarChart3,
  Blocks,
  LayoutDashboard,
  LogOut,
  Network,
  WalletCards,
} from 'lucide-react';
import { useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuditLog } from './components/AuditLog';
import { Landing } from './components/Landing';
import { PatientDashboard } from './components/PatientDashboard';
import { PerformancePanel } from './components/PerformancePanel';
import { ProviderDashboard } from './components/ProviderDashboard';
import { Registration } from './components/Registration';
import { HARDHAT_CHAIN_ID, useWallet } from './hooks/useWallet';
import './styles/app.css';

type View = 'dashboard' | 'audit' | 'performance';

const roleNames = ['Unregistered', 'Patient', 'Doctor', 'Hospital', 'Administrator'];

export default function App() {
  const wallet = useWallet();
  const [view, setView] = useState<View>('dashboard');

  const content = () => {
    if (!wallet.account)
      return (
        <Landing
          connect={() => void wallet.connect()}
          connecting={wallet.connecting}
          error={wallet.error}
        />
      );
    if (wallet.chainId !== HARDHAT_CHAIN_ID)
      return (
        <section className="container page-section narrow">
          <div className="empty-state network-warning">
            <Network />
            <h1>Switch to the local Hardhat network</h1>
            <p>This zero-cost demonstration expects chain ID 31337 at http://127.0.0.1:8545.</p>
            <button className="button primary" onClick={() => void wallet.switchNetwork()}>
              Switch network
            </button>
            {wallet.error && <div className="alert error">{wallet.error}</div>}
          </div>
        </section>
      );
    if (!wallet.contract || !wallet.signer || !wallet.chainId) return null;
    if (wallet.role === 0)
      return (
        <Registration
          account={wallet.account}
          chainId={wallet.chainId}
          signer={wallet.signer}
          contract={wallet.contract}
          onRegistered={wallet.refreshRole}
        />
      );
    if (view === 'audit') return <AuditLog contract={wallet.contract} />;
    if (view === 'performance') return <PerformancePanel />;
    if (wallet.role === 1)
      return (
        <PatientDashboard
          account={wallet.account}
          chainId={wallet.chainId}
          signer={wallet.signer}
          contract={wallet.contract}
        />
      );
    if (wallet.role === 2 || wallet.role === 3)
      return (
        <ProviderDashboard
          role={wallet.role}
          account={wallet.account}
          chainId={wallet.chainId}
          signer={wallet.signer}
          contract={wallet.contract}
        />
      );
    return <AdminDashboard contract={wallet.contract} />;
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container topbar-inner">
          <button className="brand" onClick={() => setView('dashboard')}>
            <span className="brand-mark">
              <Blocks />
            </span>
            <span>
              <strong>MediChain</strong>
              <small>Healthcare Data Sharing</small>
            </span>
          </button>
          {wallet.account && (
            <>
              <nav className="primary-nav" aria-label="Main navigation">
                <button
                  className={view === 'dashboard' ? 'active' : ''}
                  onClick={() => setView('dashboard')}
                >
                  <LayoutDashboard /> Dashboard
                </button>
                <button
                  className={view === 'audit' ? 'active' : ''}
                  onClick={() => setView('audit')}
                >
                  <Activity /> Audit log
                </button>
                <button
                  className={view === 'performance' ? 'active' : ''}
                  onClick={() => setView('performance')}
                >
                  <BarChart3 /> Metrics
                </button>
              </nav>
              <div className="wallet-summary">
                <div className="wallet-network">
                  <span className="pulse" />
                  <span>Hardhat 31337</span>
                </div>
                <div className="wallet-account">
                  <WalletCards />
                  <span>
                    <small>{roleNames[wallet.role]}</small>
                    <code>{`${wallet.account.slice(0, 6)}…${wallet.account.slice(-4)}`}</code>
                  </span>
                </div>
                <button
                  className="icon-button"
                  aria-label="Disconnect wallet"
                  onClick={wallet.disconnect}
                >
                  <LogOut />
                </button>
              </div>
            </>
          )}
        </div>
      </header>
      {wallet.error && wallet.account && (
        <div className="container top-error alert error">{wallet.error}</div>
      )}
      <div className={wallet.account ? 'container app-content' : ''}>{content()}</div>
      <footer>
        <div className="container footer-inner">
          <span>MediChain academic demonstration</span>
          <span>Local Hardhat · Local Kubo · AES-256-GCM · Mandatory cost 0</span>
        </div>
      </footer>
    </div>
  );
}
