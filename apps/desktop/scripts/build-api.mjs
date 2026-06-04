import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const desktopRoot = path.resolve(scriptsDir, '..');
const workspaceRoot = path.resolve(desktopRoot, '..', '..');
const distApiDir = path.join(desktopRoot, 'dist', 'api');

const entryPoints = {
  index: path.join(workspaceRoot, 'apps', 'api', 'src', 'index.ts'),
  'workers/autopilot-worker': path.join(
    workspaceRoot,
    'apps',
    'api',
    'src',
    'workers',
    'autopilot-worker.ts'
  )
};

const externalPackages = [
  '@libsql/client',
  'camoufox-js',
  'drizzle-orm',
  'drizzle-orm/libsql',
  'drizzle-orm/libsql/migrator',
  'fastify',
  'googleapis',
  'node-cron',
  'node-html-parser',
  'playwright',
  'zod'
];

function copyDirectory(fromPath, toPath) {
  mkdirSync(path.dirname(toPath), { recursive: true });
  cpSync(fromPath, toPath, { recursive: true });
}

rmSync(distApiDir, { recursive: true, force: true });

await build({
  absWorkingDir: workspaceRoot,
  banner: {
    js: "const import_meta_url = require('node:url').pathToFileURL(__filename).href;"
  },
  bundle: true,
  define: {
    'import.meta.url': 'import_meta_url'
  },
  entryPoints,
  external: externalPackages,
  format: 'cjs',
  logLevel: 'info',
  outExtension: {
    '.js': '.cjs'
  },
  outdir: distApiDir,
  platform: 'node',
  sourcemap: true,
  target: 'node20',
  tsconfig: path.join(workspaceRoot, 'tsconfig.json')
});

copyDirectory(
  path.join(workspaceRoot, 'packages', 'db', 'drizzle'),
  path.join(distApiDir, 'drizzle')
);
copyDirectory(
  path.join(workspaceRoot, 'packages', 'documents', 'src', 'templates'),
  path.join(distApiDir, 'templates')
);
