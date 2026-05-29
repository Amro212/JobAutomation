import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const tempDir = mkdtempSync(join(tmpdir(), 'jobautomation-electron-builder-'));

if (process.platform === 'win32') {
  writeFileSync(join(tempDir, 'pnpm.cmd'), '@echo off\r\ncorepack pnpm %*\r\n', 'utf8');
} else {
  const shimPath = join(tempDir, 'pnpm');
  writeFileSync(shimPath, '#!/usr/bin/env sh\ncorepack pnpm "$@"\n', 'utf8');
  chmodSync(shimPath, 0o755);
}

const builderArgs = process.argv.slice(2);
if (builderArgs[0] === '--') {
  builderArgs.shift();
}

const child =
  process.platform === 'win32'
    ? spawn(
        join(appRoot, 'node_modules', '.bin', 'electron-builder.cmd'),
        ['--config', 'electron-builder.yml', ...builderArgs],
        {
          cwd: appRoot,
          env: {
            ...process.env,
            PATH: `${tempDir}${delimiter}${process.env.PATH ?? ''}`,
          },
          shell: true,
          stdio: 'inherit',
        },
      )
    : spawn(join(appRoot, 'node_modules', '.bin', 'electron-builder'), ['--config', 'electron-builder.yml', ...builderArgs], {
        cwd: appRoot,
        env: {
          ...process.env,
          PATH: `${tempDir}${delimiter}${process.env.PATH ?? ''}`,
        },
        stdio: 'inherit',
      });

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
