import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const apiPort = argValue('api-port', '3201');
const greenhouseStubPort = argValue('greenhouse-stub-port', '3202');
const dbPath = join(repoRoot, 'apps', 'api', 'data', 'playwright.sqlite');

rmSync(dbPath, { force: true });

const child = spawn('corepack', ['pnpm', '--filter', '@jobautomation/api', 'dev'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    JOB_AUTOMATION_DB_PATH: dbPath,
    API_PORT: apiPort,
    API_BASE_URL: `http://127.0.0.1:${apiPort}`,
    GREENHOUSE_API_BASE_URL: `http://127.0.0.1:${greenhouseStubPort}/v1/boards`,
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
