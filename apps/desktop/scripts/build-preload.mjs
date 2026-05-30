import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, context } from 'esbuild';

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const desktopRoot = path.resolve(scriptsDir, '..');

const entryPoint = path.join(desktopRoot, 'src', 'preload', 'index.ts');
const outfile = path.join(desktopRoot, 'dist', 'main', 'preload', 'index.js');

const isWatch = process.argv.includes('--watch');

const esbuildOptions = {
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

async function run() {
  if (isWatch) {
    const ctx = await context(esbuildOptions);
    await ctx.watch();
    console.log('[preload-watcher] Watching preload script for changes...');
  } else {
    await build(esbuildOptions);
    console.log('[preload-build] Preload script compiled successfully as CommonJS!');
  }
}

run().catch((err) => {
  console.error('[preload-build] Build failed:', err);
  process.exit(1);
});
