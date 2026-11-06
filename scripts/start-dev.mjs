import { spawn, spawnSync } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const runtime = join(root, 'runtime');
const nodeExecutable = join(root, 'tools', 'node', 'node.exe');
const hardhatCli = join(root, 'node_modules', 'hardhat', 'internal', 'cli', 'bootstrap.js');

await mkdir(runtime, { recursive: true });

async function rpc(method) {
  try {
    const response = await fetch('http://127.0.0.1:8545', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      signal: AbortSignal.timeout(1200),
    });
    return (await response.json()).result ?? null;
  } catch {
    return null;
  }
}

async function httpReady(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(check, label, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`${label} did not become ready within ${timeoutMs / 1000} seconds.`);
}

async function startDetached(name, args) {
  const log = openSync(join(runtime, `${name}.log`), 'a');
  const child = spawn(nodeExecutable, args, {
    cwd: root,
    detached: true,
    stdio: ['ignore', log, log],
    windowsHide: true,
  });
  child.unref();
  await writeFile(join(runtime, `${name}.pid`), String(child.pid), 'utf8');
  return child.pid;
}

const ipfs = spawnSync(nodeExecutable, [join(root, 'scripts', 'ipfs.mjs'), 'start'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
});
if (ipfs.status !== 0) throw new Error(ipfs.stderr || ipfs.stdout);
console.log(ipfs.stdout.trim());

let chainId = await rpc('eth_chainId');
if (!chainId) {
  const pid = await startDetached('hardhat-node', [
    hardhatCli,
    'node',
    '--hostname',
    '127.0.0.1',
    '--port',
    '8545',
  ]);
  await waitFor(() => rpc('eth_chainId'), 'Hardhat node');
  console.log(`Hardhat node started (PID ${pid}).`);
  chainId = await rpc('eth_chainId');
}
if (chainId !== '0x7a69') throw new Error(`Port 8545 is using unexpected chain ID ${chainId}.`);

const deployment = spawnSync(
  nodeExecutable,
  [hardhatCli, 'run', join(root, 'scripts', 'deploy.ts'), '--network', 'localhost'],
  { cwd: root, encoding: 'utf8', windowsHide: true },
);
if (deployment.status !== 0) throw new Error(deployment.stderr || deployment.stdout);
console.log(deployment.stdout.trim());

if (!(await httpReady('http://127.0.0.1:5173'))) {
  const pid = await startDetached('frontend', [
    join(root, 'scripts', 'frontend-command.mjs'),
    'dev',
  ]);
  await waitFor(() => httpReady('http://127.0.0.1:5173'), 'Vite frontend', 30_000);
  console.log(`Frontend started (PID ${pid}).`);
}

console.log('');
console.log('MediChain is ready: http://127.0.0.1:5173');
console.log('Hardhat RPC:      http://127.0.0.1:8545 (chain ID 31337)');
console.log('Kubo RPC:         http://127.0.0.1:5001');
console.log('Use the first Hardhat account as Administrator.');
