import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, test } from 'vitest';

import { compileLatexDocument } from '../../../packages/documents/src';

const createdPaths: string[] = [];

function createTempFilePath(name: string): string {
  const path = fileURLToPath(new URL(`../../../data/test/${randomUUID()}/${name}`, import.meta.url));
  mkdirSync(dirname(path), { recursive: true });
  createdPaths.push(path);
  return path;
}

afterEach(() => {
  for (const path of createdPaths.splice(0)) {
    try {
      rmSync(dirname(path), { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors in test temp directories.
    }
  }
});

describe('compileLatexDocument', () => {
  test('records a successful compile when the stub compiler writes a PDF', async () => {
    const stubPath = fileURLToPath(
      new URL('../../fixtures/documents/tectonic-stub.mjs', import.meta.url)
    );
    const texPath = createTempFilePath('resume.tex');
    const outDir = dirname(texPath);

    writeFileSync(
      texPath,
      String.raw`\documentclass{article}\begin{document}Hello\end{document}`,
      'utf8'
    );

    const result = await compileLatexDocument({
      texPath,
      outDir,
      tectonic: {
        command: 'node',
        args: [stubPath]
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pdfPath).toContain('resume.pdf');
      const pdf = readFileSync(result.pdfPath);
      const pdfText = pdf.toString('latin1');
      expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
      expect(pdfText).toContain('xref');
      expect(pdfText).toContain('startxref');
      expect(pdfText.trimEnd().endsWith('%%EOF')).toBe(true);
    }
  });

  test('captures diagnostics when the compiler exits non-zero', async () => {
    const texPath = createTempFilePath('failure.tex');
    const outDir = dirname(texPath);

    writeFileSync(
      texPath,
      String.raw`\documentclass{article}\begin{document}Hello\end{document}`,
      'utf8'
    );

    const result = await compileLatexDocument({
      texPath,
      outDir,
      tectonic: {
        command: 'node',
        args: ['-e', 'process.exit(1)']
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnosticsPath).toContain('tectonic.log');
    }
  });
});
