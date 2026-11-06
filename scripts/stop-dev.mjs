import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const runtime = join(root, 'runtime');

for (const name of ['frontend', 'hardhat-node']) {
  const pidFile = join(runtime, `${name}.pid`);
  try {
    const pid = Number((await readFile(pidFile, 'utf8')).trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        if (process.platform === 'win32') {
          spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
            encoding: 'utf8',
            windowsHide: true,
          });
        } else {
          process.kill(pid);
        }
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    await rm(pidFile, { force: true });
    console.log(`${name} stopped.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const ipfs = spawnSync(
  join(root, 'tools', 'node', 'node.exe'),
  [join(root, 'scripts', 'ipfs.mjs'), 'stop'],
  {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  },
);
if (ipfs.stdout.trim()) console.log(ipfs.stdout.trim());
