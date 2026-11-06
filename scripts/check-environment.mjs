import { access, mkdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const major = Number(process.versions.node.split('.')[0]);

if (major < 22) {
  throw new Error(`Node.js 22 or newer is required; found ${process.versions.node}`);
}

for (const directory of ['runtime', 'results', 'tmp']) {
  const path = join(root, directory);
  await mkdir(path, { recursive: true });
  await access(path, constants.R_OK | constants.W_OK);
}

console.log(`Environment OK: Node ${process.versions.node} on ${process.platform}/${process.arch}`);
