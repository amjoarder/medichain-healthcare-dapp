import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const result = spawnSync(
  join(root, 'tools', 'node', 'node.exe'),
  [join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(root, 'benchmarks', 'run-all.mts')],
  { cwd: root, stdio: 'inherit', windowsHide: true },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
