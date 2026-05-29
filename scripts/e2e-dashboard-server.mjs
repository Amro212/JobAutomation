import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const apiPort = argValue('api-port', '3201');
const dashboardPort = argValue('dashboard-port', '3200');

const child = spawn(
  'corepack',
  [
    'pnpm',
    '--filter',
    '@jobautomation/dashboard',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    dashboardPort,
  ],
  {
    cwd: repoRoot,
    env: {
      ...process.env,
      API_BASE_URL: `http://127.0.0.1:${apiPort}`,
    },
    shell: process.platform === 'win32',
    stdio: 'inherit',
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
