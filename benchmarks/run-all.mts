import assert from 'node:assert/strict';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { ContractFactory, JsonRpcProvider, formatEther } from 'ethers';
import { addBytes, catBytes, getIpfsVersion } from '../frontend/src/lib/ipfs/client.ts';
import {
  decryptFile,
  encryptFile,
  parseEncryptedPayload,
  serializeEncryptedPayload,
} from '../frontend/src/lib/crypto/fileCrypto.ts';

const RESULTS = 'results';
const CHARTS = 'results/charts';
await mkdir(CHARTS, { recursive: true });

function csv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = String(value ?? '');
    return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return `${headers.join(',')}\n${rows.map((row) => headers.map((header) => escape(row[header])).join(',')).join('\n')}\n`;
}

function cpuDelta(before: NodeJS.CpuUsage, elapsedMs: number) {
  const after = process.cpuUsage(before);
  const cpuMs = (after.user + after.system) / 1000;
  return {
    cpuMs: Number(cpuMs.toFixed(3)),
    cpuPercent: Number(((cpuMs / elapsedMs) * 100).toFixed(3)),
  };
}

function makeBytes(size: number) {
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 65_536) {
    crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65_536, size)));
  }
  return bytes;
}

async function runPool(
  total: number,
  concurrency: number,
  operation: (index: number) => Promise<void>,
) {
  let cursor = 0;
  let completed = 0;
  let errors = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      try {
        await operation(index);
        completed++;
      } catch {
        errors++;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(total, concurrency) }, () => worker()));
  return { completed, errors };
}

function svgBar(title: string, labels: string[], values: number[], unit: string) {
  const width = 900;
  const height = 500;
  const max = Math.max(...values, 1);
  const barWidth = Math.max(18, Math.min(70, 680 / labels.length));
  const gap = (760 - labels.length * barWidth) / Math.max(labels.length, 1);
  const bars = values
    .map((value, index) => {
      const barHeight = (value / max) * 300;
      const x = 80 + index * (barWidth + gap) + gap / 2;
      const y = 390 - barHeight;
      const label = labels[index].replace(/[&<>]/gu, '');
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="5" fill="#0d857d"/><text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-size="11" fill="#405268">${value.toFixed(2)}</text><text x="${x + barWidth / 2}" y="414" text-anchor="middle" font-size="10" fill="#607184" transform="rotate(25 ${x + barWidth / 2} 414)">${label}</text>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="42" y="42" font-family="Arial" font-size="22" font-weight="700" fill="#102a43">${title}</text><text x="42" y="66" font-family="Arial" font-size="12" fill="#607184">Measured locally - ${unit}</text><line x1="65" y1="390" x2="860" y2="390" stroke="#cbdadd"/>${bars}</svg>`;
}

const provider = new JsonRpcProvider('http://127.0.0.1:8545');
assert.equal((await provider.getNetwork()).chainId, 31337n);
const [admin, patient, doctor, hospital] = await Promise.all(
  [0, 7, 8, 9].map((index) => provider.getSigner(index)),
);
const artifact = JSON.parse(
  await readFile('artifacts/contracts/HealthcareRecords.sol/HealthcareRecords.json', 'utf8'),
);
const gasRows: Record<string, unknown>[] = [];
const latencyRows: Record<string, unknown>[] = [];

async function measuredTransaction(operation: string, transactionPromise: Promise<unknown>) {
  const started = performance.now();
  const transaction = (await transactionPromise) as { wait(): Promise<any> };
  const receipt = await transaction.wait();
  const elapsed = performance.now() - started;
  const gasPrice = receipt.gasPrice ?? 0n;
  const cost = receipt.gasUsed * gasPrice;
  gasRows.push({
    operation,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPriceWei: gasPrice.toString(),
    simulatedCostWei: cost.toString(),
    simulatedCostEth: formatEther(cost),
    environment: 'Hardhat local simulated ETH - no real charge',
    transactionHash: receipt.hash,
  });
  latencyRows.push({ operation, latencyMs: elapsed.toFixed(3), transactionHash: receipt.hash });
  return receipt;
}

const factory = new ContractFactory(artifact.abi, artifact.bytecode, admin);
const deployStarted = performance.now();
const contract = await factory.deploy();
const deployment = contract.deploymentTransaction();
assert(deployment);
const deploymentReceipt = await deployment.wait();
assert(deploymentReceipt);
const deploymentMs = performance.now() - deployStarted;
const deploymentGasPrice = deploymentReceipt.gasPrice ?? 0n;
const deploymentCost = deploymentReceipt.gasUsed * deploymentGasPrice;
const contractAddress = await contract.getAddress();
const deploymentOutput = {
  operation: 'HealthcareRecords deployment',
  environment: 'Hardhat local simulated network',
  chainId: 31337,
  contractAddress,
  transactionHash: deploymentReceipt.hash,
  blockNumber: deploymentReceipt.blockNumber,
  gasUsed: deploymentReceipt.gasUsed.toString(),
  effectiveGasPriceWei: deploymentGasPrice.toString(),
  simulatedTransactionCostWei: deploymentCost.toString(),
  simulatedTransactionCostEth: formatEther(deploymentCost),
  latencyMs: Number(deploymentMs.toFixed(3)),
  realMonetaryCost: 0,
  note: 'Hardhat ETH is simulated. No real ETH or monetary charge was used.',
  measuredAt: new Date().toISOString(),
};
await writeFile(
  `${RESULTS}/benchmark-deployment-gas.json`,
  `${JSON.stringify(deploymentOutput, null, 2)}\n`,
);

const patientAddress = await patient.getAddress();
const doctorAddress = await doctor.getAddress();
const hospitalAddress = await hospital.getAddress();
const demoKey = JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'benchmark-x', y: 'benchmark-y' });
await measuredTransaction(
  'patient registration',
  contract.connect(patient).registerPatient('Benchmark Patient', demoKey),
);
await measuredTransaction(
  'doctor registration',
  contract.connect(doctor).registerDoctor('Benchmark Doctor', 'General', 'BENCH-DOC-1', demoKey),
);
await measuredTransaction(
  'hospital registration',
  contract.connect(hospital).registerHospital('Benchmark Hospital', 'BENCH-HOSP-1', demoKey),
);
await measuredTransaction('doctor approval', contract.connect(admin).approveDoctor(doctorAddress));
await measuredTransaction(
  'hospital approval',
  contract.connect(admin).approveHospital(hospitalAddress),
);
await measuredTransaction(
  'record creation',
  contract
    .connect(patient)
    .addMedicalRecord(
      'Benchmark record',
      'bafk-benchmark-ciphertext',
      `0x${'12'.repeat(32)}`,
      'bafk-owner-envelope',
    ),
);
await measuredTransaction(
  'permission grant',
  contract.connect(patient).grantPermission(1n, doctorAddress, 'bafk-doctor-envelope'),
);
await measuredTransaction('DApp access log', contract.connect(doctor).logRecordAccess(1n));
await measuredTransaction(
  'permission revoke',
  contract.connect(patient).revokePermission(1n, doctorAddress),
);
await writeFile(`${RESULTS}/transaction-gas.csv`, csv(gasRows));
await writeFile(`${RESULTS}/transaction-latency.csv`, csv(latencyRows));

const resourceRows: Record<string, unknown>[] = [
  {
    phase: 'baseline',
    workload: 0,
    concurrency: 0,
    elapsedMs: 0,
    cpuMs: 0,
    cpuPercent: 0,
    rssBytes: process.memoryUsage().rss,
    heapUsedBytes: process.memoryUsage().heapUsed,
  },
];
const encryptionRows: Record<string, unknown>[] = [];
const transferRows: Record<string, unknown>[] = [];

for (const sizeMiB of [1, 5, 10, 20]) {
  const plain = makeBytes(sizeMiB * 1024 * 1024);
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const workflowStarted = performance.now();
  const encryptStarted = performance.now();
  const encrypted = await encryptFile(plain);
  const encryptionMs = performance.now() - encryptStarted;
  const serialized = serializeEncryptedPayload(encrypted);
  const uploadStarted = performance.now();
  const stored = await addBytes(serialized, `benchmark-${sizeMiB}MiB.mch`);
  const uploadMs = performance.now() - uploadStarted;
  const downloadStarted = performance.now();
  const retrieved = await catBytes(stored.cid);
  const downloadMs = performance.now() - downloadStarted;
  const decryptStarted = performance.now();
  const decrypted = await decryptFile(parseEncryptedPayload(retrieved), encrypted.key);
  const decryptionMs = performance.now() - decryptStarted;
  assert.equal(Buffer.compare(Buffer.from(plain), Buffer.from(decrypted)), 0);
  const workflowMs = performance.now() - workflowStarted;
  const cpu = cpuDelta(cpuBefore, workflowMs);
  const memoryAfter = process.memoryUsage();
  encryptionRows.push({
    sizeMiB,
    plainBytes: plain.length,
    encryptedBytes: serialized.length,
    encryptionMs: encryptionMs.toFixed(3),
    decryptionMs: decryptionMs.toFixed(3),
    authenticationVerified: true,
  });
  transferRows.push({
    sizeMiB,
    cid: stored.cid,
    uploadMs: uploadMs.toFixed(3),
    downloadMs: downloadMs.toFixed(3),
    totalWorkflowMs: workflowMs.toFixed(3),
    uploadedBytes: serialized.length,
    downloadedBytes: retrieved.length,
    uploadBytesPerSecond: Math.round(serialized.length / (uploadMs / 1000)),
    downloadBytesPerSecond: Math.round(retrieved.length / (downloadMs / 1000)),
  });
  resourceRows.push({
    phase: 'crypto-ipfs',
    workload: sizeMiB,
    concurrency: 1,
    elapsedMs: workflowMs.toFixed(3),
    ...cpu,
    rssBytes: memoryAfter.rss,
    heapUsedBytes: memoryAfter.heapUsed,
    memoryDeltaBytes: memoryAfter.rss - memoryBefore.rss,
  });
}
await writeFile(`${RESULTS}/encryption-benchmark.csv`, csv(encryptionRows));
await writeFile(`${RESULTS}/file-transfer-benchmark.csv`, csv(transferRows));

const scalabilityRows: Record<string, unknown>[] = [];
const throughputRows: Record<string, unknown>[] = [];
for (const workload of [10, 50, 100, 500]) {
  for (const concurrency of [1, 5, 10, 20]) {
    const memoryBefore = process.memoryUsage();
    const cpuBefore = process.cpuUsage();
    const started = performance.now();
    const outcome = await runPool(workload, concurrency, async () => {
      await contract.hasAccess(1n, patientAddress);
    });
    const elapsedMs = performance.now() - started;
    const cpu = cpuDelta(cpuBefore, elapsedMs);
    const memoryAfter = process.memoryUsage();
    const throughput = outcome.completed / (elapsedMs / 1000);
    const row = {
      operation: 'blockchain hasAccess RPC',
      workload,
      concurrency,
      completed: outcome.completed,
      errors: outcome.errors,
      elapsedMs: elapsedMs.toFixed(3),
      throughputOpsPerSecond: throughput.toFixed(3),
      averageLatencyMs: (elapsedMs / workload).toFixed(3),
      ...cpu,
      rssBytes: memoryAfter.rss,
      heapUsedBytes: memoryAfter.heapUsed,
      memoryDeltaBytes: memoryAfter.rss - memoryBefore.rss,
    };
    scalabilityRows.push(row);
    throughputRows.push({
      operation: row.operation,
      workload,
      concurrency,
      completed: row.completed,
      errors: row.errors,
      elapsedSeconds: (elapsedMs / 1000).toFixed(6),
      throughputOpsPerSecond: row.throughputOpsPerSecond,
    });
    resourceRows.push({
      phase: 'blockchain-read-scalability',
      workload,
      concurrency,
      elapsedMs: row.elapsedMs,
      cpuMs: row.cpuMs,
      cpuPercent: row.cpuPercent,
      rssBytes: row.rssBytes,
      heapUsedBytes: row.heapUsedBytes,
      memoryDeltaBytes: row.memoryDeltaBytes,
    });
  }
}
await writeFile(`${RESULTS}/scalability.csv`, csv(scalabilityRows));
await writeFile(`${RESULTS}/throughput.csv`, csv(throughputRows));
await writeFile(`${RESULTS}/resource-usage.csv`, csv(resourceRows));

const summary = {
  status: 'PASS',
  measuredAt: new Date().toISOString(),
  mandatoryMonetaryCost: 0,
  monetaryNote: 'All ETH values are simulated on the local Hardhat network.',
  environment: {
    os: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? 'unknown',
    logicalCpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytesAtSummary: freemem(),
    node: process.version,
    hardhat: '2.29.1',
    kubo: await getIpfsVersion(),
    chainId: 31337,
  },
  fileSizesMiB: [1, 5, 10, 20],
  scalabilityWorkloads: [10, 50, 100, 500],
  concurrencyLevels: [1, 5, 10, 20],
  deployment: deploymentOutput,
  transactionCountMeasured: gasRows.length,
  averageTransactionGas: Math.round(
    gasRows.reduce((sum, row) => sum + Number(row.gasUsed), 0) / gasRows.length,
  ),
  maximumObservedThroughputOpsPerSecond: Math.max(
    ...scalabilityRows.map((row) => Number(row.throughputOpsPerSecond)),
  ),
  errorsAcrossScalabilityRuns: scalabilityRows.reduce((sum, row) => sum + Number(row.errors), 0),
  rawFiles: [
    'benchmark-deployment-gas.json',
    'transaction-gas.csv',
    'transaction-latency.csv',
    'encryption-benchmark.csv',
    'file-transfer-benchmark.csv',
    'throughput.csv',
    'resource-usage.csv',
    'scalability.csv',
  ],
};
await writeFile(`${RESULTS}/benchmark-summary.json`, `${JSON.stringify(summary, null, 2)}\n`);

const performanceUi = {
  measuredAt: summary.measuredAt,
  environment: summary.environment,
  deployment: {
    gasUsed: Number(deploymentOutput.gasUsed),
    latencyMs: deploymentOutput.latencyMs,
    simulatedCostEth: deploymentOutput.simulatedTransactionCostEth,
  },
  averageTransactionGas: summary.averageTransactionGas,
  maximumThroughput: summary.maximumObservedThroughputOpsPerSecond,
  scalabilityRuns: scalabilityRows.length,
  scalabilityErrors: summary.errorsAcrossScalabilityRuns,
  transactions: gasRows.map((row, index) => ({
    operation: String(row.operation),
    gasUsed: Number(row.gasUsed),
    latencyMs: Number(latencyRows[index].latencyMs),
    simulatedCostEth: String(row.simulatedCostEth),
  })),
  fileBenchmarks: encryptionRows.map((row, index) => ({
    sizeMiB: Number(row.sizeMiB),
    encryptionMs: Number(row.encryptionMs),
    decryptionMs: Number(row.decryptionMs),
    uploadMs: Number(transferRows[index].uploadMs),
    downloadMs: Number(transferRows[index].downloadMs),
  })),
  scalability: scalabilityRows
    .filter((row) => Number(row.workload) === 500)
    .map((row) => ({
      concurrency: Number(row.concurrency),
      completed: Number(row.completed),
      throughput: Number(row.throughputOpsPerSecond),
      averageLatencyMs: Number(row.averageLatencyMs),
      cpuPercent: Number(row.cpuPercent),
      rssBytes: Number(row.rssBytes),
    })),
};
await writeFile(
  'frontend/src/generated/performance.json',
  `${JSON.stringify(performanceUi, null, 2)}\n`,
);

await writeFile(
  `${CHARTS}/gas-by-operation.svg`,
  svgBar(
    'Gas used by operation',
    gasRows.map((row) => String(row.operation)),
    gasRows.map((row) => Number(row.gasUsed)),
    'gas',
  ),
);
await writeFile(
  `${CHARTS}/crypto-time-vs-size.svg`,
  svgBar(
    'Encryption time by file size',
    encryptionRows.map((row) => `${row.sizeMiB} MiB`),
    encryptionRows.map((row) => Number(row.encryptionMs)),
    'milliseconds',
  ),
);
await writeFile(
  `${CHARTS}/ipfs-time-vs-size.svg`,
  svgBar(
    'IPFS upload time by file size',
    transferRows.map((row) => `${row.sizeMiB} MiB`),
    transferRows.map((row) => Number(row.uploadMs)),
    'milliseconds',
  ),
);
const concurrencyOne = scalabilityRows.filter((row) => row.concurrency === 1);
await writeFile(
  `${CHARTS}/throughput-vs-workload.svg`,
  svgBar(
    'RPC throughput by workload',
    concurrencyOne.map((row) => String(row.workload)),
    concurrencyOne.map((row) => Number(row.throughputOpsPerSecond)),
    'operations per second',
  ),
);
await writeFile(
  `${CHARTS}/resources-vs-workload.svg`,
  svgBar(
    'CPU use by workload',
    concurrencyOne.map((row) => String(row.workload)),
    concurrencyOne.map((row) => Number(row.cpuPercent)),
    'percent of one logical core',
  ),
);

console.log(
  `Benchmark complete: ${gasRows.length} transactions, ${transferRows.length} file sizes, ${scalabilityRows.length} scalability runs.`,
);
console.log(
  `Maximum observed throughput: ${summary.maximumObservedThroughputOpsPerSecond.toFixed(3)} operations/second.`,
);
