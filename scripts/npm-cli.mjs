import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const bundledNpmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npmCli = process.env.npm_execpath || bundledNpmCli;
const result = spawnSync(process.execPath, [npmCli, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  windowsHide: true,
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
