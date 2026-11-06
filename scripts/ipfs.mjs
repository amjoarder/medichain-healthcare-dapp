import { spawn } from 'node:child_process';
import { openSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const action = process.argv[2] ?? 'status';
const root = process.cwd();
const runtimeRoot = join(root, 'runtime');
const repository = join(runtimeRoot, 'ipfs');
const executable = join(root, 'tools', 'kubo', 'ipfs.exe');
const pidFile = join(runtimeRoot, 'ipfs-daemon.pid');
const logFile = join(runtimeRoot, 'ipfs-daemon.log');

async function getVersion() {
  try {
    const response = await fetch('http://127.0.0.1:5001/api/v0/version', {
      method: 'POST',
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return null;
    return (await response.json()).Version ?? null;
  } catch {
    return null;
  }
}

async function waitForVersion(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const version = await getVersion();
    if (version) return version;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

if (!['start', 'stop', 'status'].includes(action)) {
  throw new Error('Usage: node scripts/ipfs.mjs <start|stop|status>');
}

if (action === 'status') {
  const version = await getVersion();
  if (!version) {
    console.log('Kubo is stopped.');
    process.exitCode = 1;
  } else {
    console.log(`Kubo is running (version ${version}).`);
  }
}

if (action === 'start') {
  const currentVersion = await getVersion();
  if (currentVersion) {
    console.log(`Kubo is already running (version ${currentVersion}).`);
  } else {
    await mkdir(runtimeRoot, { recursive: true });
    const logDescriptor = openSync(logFile, 'a');
    const child = spawn(executable, ['daemon', '--offline'], {
      cwd: root,
      detached: true,
      env: { ...process.env, IPFS_PATH: repository },
      stdio: ['ignore', logDescriptor, logDescriptor],
      windowsHide: true,
    });
    child.unref();
    await writeFile(pidFile, String(child.pid), 'utf8');
    const version = await waitForVersion(15_000);
    if (!version) {
      try {
        process.kill(child.pid);
      } catch {
        // The failed daemon may already have exited.
      }
      throw new Error(`Kubo did not become ready. See ${logFile}`);
    }
    console.log(`Kubo started (version ${version}, PID ${child.pid}).`);
  }
}

if (action === 'stop') {
  let pid;
  try {
    pid = Number((await readFile(pidFile, 'utf8')).trim());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (Number.isInteger(pid) && pid > 0) {
    try {
      process.kill(pid);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
  await rm(pidFile, { force: true });
  console.log('Project Kubo process stopped.');
}
