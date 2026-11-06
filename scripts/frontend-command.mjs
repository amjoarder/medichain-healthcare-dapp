import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [command, ...forwardedArgs] = process.argv.slice(2);
if (!command) throw new Error('Usage: node scripts/frontend-command.mjs <npm-script> [...args]');

const projectRoot = resolve(process.cwd());
const drive = ['Z:', 'Y:', 'X:', 'W:', 'V:', 'U:', 'T:', 'S:', 'R:'].find(
  (candidate) => !existsSync(`${candidate}\\`),
);
if (!drive) throw new Error('No free drive letter is available for the Vite-safe project alias.');
const mapping = spawnSync('subst.exe', [drive, projectRoot], {
  encoding: 'utf8',
  windowsHide: true,
});
if (mapping.status !== 0)
  throw new Error(mapping.stderr || 'Unable to create temporary drive mapping.');

const nodeExecutable = join(projectRoot, 'tools', 'node', 'node.exe');
const frontendRoot = join(`${drive}\\`, 'frontend');
const entrypoints = {
  test: [join(frontendRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'run'],
  dev: [join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1'],
  preview: [
    join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
    'preview',
    '--host',
    '127.0.0.1',
  ],
};

function run(args) {
  const result = spawnSync(nodeExecutable, args, {
    cwd: frontendRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

try {
  if (command === 'build') {
    const typecheck = run([join(frontendRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-b']);
    process.exitCode =
      typecheck === 0
        ? run([
            join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
            'build',
            ...forwardedArgs,
          ])
        : typecheck;
  } else {
    const baseArgs = entrypoints[command];
    if (!baseArgs) throw new Error(`Unsupported frontend command: ${command}`);
    process.exitCode = run([...baseArgs, ...forwardedArgs]);
  }
} finally {
  spawnSync('subst.exe', [drive, '/D'], { windowsHide: true });
}
