import { BarChart3, CircleCheck, Gauge, ReceiptText, Timer, Workflow } from 'lucide-react';
import results from '../generated/performance.json';

const integer = new Intl.NumberFormat('en-US');
const fixed = (value: number) => `${value.toFixed(3)} ms`;
const mib = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

export function PerformancePanel() {
  const metrics = [
    [Gauge, integer.format(results.deployment.gasUsed), 'deployment gas'],
    [Timer, fixed(results.deployment.latencyMs), 'deployment latency'],
    [ReceiptText, integer.format(results.averageTransactionGas), 'average transaction gas'],
    [BarChart3, `${results.maximumThroughput.toFixed(3)} ops/s`, 'maximum RPC throughput'],
    [Workflow, `${results.scalabilityRuns} runs`, 'scalability matrix'],
    [CircleCheck, `${results.scalabilityErrors} errors`, 'across scalability runs'],
  ] as const;
  return (
    <section className="page-section">
      <div className="dashboard-heading">
        <div>
          <span className="eyebrow">Measured locally</span>
          <h1>Performance evaluation</h1>
          <p>Every reported value is produced by a real benchmark run; no values are invented.</p>
        </div>
        <span className="status secure">Required cost: 0</span>
      </div>
      <div className="metrics-grid performance-grid">
        {metrics.map(([Icon, title, subtitle]) => (
          <div className="metric-card" key={title}>
            <Icon />
            <div>
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="performance-sections">
        <section className="panel performance-section">
          <div className="panel-title">
            <ReceiptText />
            <div>
              <h2>Transaction gas and latency</h2>
              <p>Receipt-derived values from nine local-chain transactions.</p>
            </div>
          </div>
          <div className="performance-table-wrap">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Gas used</th>
                  <th>Latency</th>
                  <th>Simulated cost</th>
                </tr>
              </thead>
              <tbody>
                {results.transactions.map((row) => (
                  <tr key={row.operation}>
                    <td>{row.operation}</td>
                    <td>{integer.format(row.gasUsed)}</td>
                    <td>{fixed(row.latencyMs)}</td>
                    <td>{row.simulatedCostEth} ETH</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel performance-section">
          <div className="panel-title">
            <Timer />
            <div>
              <h2>Encryption and IPFS transfer</h2>
              <p>Authenticated round trips using actual 1–20 MiB ciphertext objects.</p>
            </div>
          </div>
          <div className="performance-table-wrap">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Encrypt</th>
                  <th>Decrypt</th>
                  <th>IPFS upload</th>
                  <th>IPFS download</th>
                </tr>
              </thead>
              <tbody>
                {results.fileBenchmarks.map((row) => (
                  <tr key={row.sizeMiB}>
                    <td>{row.sizeMiB} MiB</td>
                    <td>{fixed(row.encryptionMs)}</td>
                    <td>{fixed(row.decryptionMs)}</td>
                    <td>{fixed(row.uploadMs)}</td>
                    <td>{fixed(row.downloadMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel performance-section">
          <div className="panel-title">
            <BarChart3 />
            <div>
              <h2>Scalability evidence</h2>
              <p>Largest 500-operation workload at four concurrency levels.</p>
            </div>
          </div>
          <div className="performance-table-wrap">
            <table className="performance-table">
              <thead>
                <tr>
                  <th>Concurrency</th>
                  <th>Completed</th>
                  <th>Throughput</th>
                  <th>Average latency</th>
                  <th>CPU</th>
                  <th>RSS memory</th>
                </tr>
              </thead>
              <tbody>
                {results.scalability.map((row) => (
                  <tr key={row.concurrency}>
                    <td>{row.concurrency}</td>
                    <td>{row.completed}</td>
                    <td>{row.throughput.toFixed(3)} ops/s</td>
                    <td>{fixed(row.averageLatencyMs)}</td>
                    <td>{row.cpuPercent.toFixed(3)}%</td>
                    <td>{mib(row.rssBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="panel benchmark-note">
          <BarChart3 />
          <div>
            <h2>Benchmark evidence</h2>
            <p>
              Measured {new Date(results.measuredAt).toLocaleString()} on {results.environment.cpu}{' '}
              with Node {results.environment.node}, Hardhat {results.environment.hardhat}, and Kubo{' '}
              {results.environment.kubo}. All ETH is simulated; real monetary cost is{' '}
              <strong>0</strong>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
