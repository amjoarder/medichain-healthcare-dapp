import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(process.cwd());
const node = join(root, 'tools', 'node', 'node.exe');
const stop = spawnSync(node, [join(root, 'scripts', 'stop-dev.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (stop.status !== 0) process.exit(stop.status ?? 1);

for (const target of [
  join(root, 'runtime', 'ipfs'),
  join(root, 'frontend', 'src', 'generated', 'contract.json'),
]) {
  if (!resolve(target).startsWith(`${root}\\`)) throw new Error(`Unsafe reset target: ${target}`);
  await rm(target, { recursive: true, force: true });
}
console.log(
  'Local Kubo data and generated deployment configuration were reset. Run npm run setup, then npm run dev.',
);
