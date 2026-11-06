import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const [executableArg, repositoryArg] = process.argv.slice(2);
if (!executableArg || !repositoryArg) {
  throw new Error('Usage: node scripts/configure-ipfs.mjs <ipfs-executable> <repository>');
}

const executable = resolve(executableArg);
const env = { ...process.env, IPFS_PATH: resolve(repositoryArg) };

function runConfig(key, value, json = false) {
  const args = ['config'];
  if (json) args.push('--json');
  args.push(key, json ? JSON.stringify(value) : value);
  const result = spawnSync(executable, args, { encoding: 'utf8', env });
  if (result.status !== 0) {
    throw new Error(`Kubo config failed for ${key}: ${result.stderr || result.stdout}`);
  }
}

runConfig('Addresses.API', '/ip4/127.0.0.1/tcp/5001');
runConfig('Addresses.Gateway', '/ip4/127.0.0.1/tcp/8080');
runConfig(
  'API.HTTPHeaders.Access-Control-Allow-Origin',
  ['http://127.0.0.1:5173', 'http://localhost:5173'],
  true,
);
runConfig('API.HTTPHeaders.Access-Control-Allow-Methods', ['GET', 'POST', 'PUT'], true);
runConfig('API.HTTPHeaders.Access-Control-Allow-Headers', ['Content-Type'], true);

console.log('Kubo loopback addresses and local-only browser origins configured.');
