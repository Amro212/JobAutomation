import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(desktopDir, 'renderer'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': path.resolve(desktopDir, 'renderer/src')
    }
  },
  build: {
    outDir: path.resolve(desktopDir, 'dist/renderer'),
    emptyOutDir: true
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  }
});
