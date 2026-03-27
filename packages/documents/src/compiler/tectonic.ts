import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { resolveTectonicCommand, type ResolvedTectonicCommand } from './resolve-tectonic';

const TECTONIC_INCOMPATIBLE_LINES = [
  /^\\input\{glyphtounicode\}\s*$/,
  /^\\pdfgentounicode\s*=\s*\d+\s*$/
];

function sanitizeForTectonic(texContent: string): string {
  // "\\&" in prose is a common LLM typo: "\\" is a line break, then "&" becomes a misplaced
  // alignment tab (Tectonic: "Misplaced alignment tab character &"). Literal "&" must be "\&".
  const ampersandTypoFixed = texContent.replace(/\\\\&/g, '\\&');

  return ampersandTypoFixed
    .split(/\r?\n/)
    .map((line) => {
      for (const pattern of TECTONIC_INCOMPATIBLE_LINES) {
        if (pattern.test(line.trim())) {
          return `% [tectonic-compat] ${line}`;
        }
      }
      return line;
    })
    .join('\n');
}

export type TectonicCommand = ResolvedTectonicCommand;

export type TectonicCompileSuccess = {
  ok: true;
  pdfPath: string;
  stdout: string;
  stderr: string;
  diagnosticsPath: string;
};

export type TectonicCompileFailure = {
  ok: false;
  code: number | null;
  stdout: string;
  stderr: string;
  diagnosticsPath: string;
};

export type TectonicCompileResult = TectonicCompileSuccess | TectonicCompileFailure;

export type CompileLatexDocumentInput = {
  texPath: string;
  outDir: string;
  tectonic?: TectonicCommand;
  env?: NodeJS.ProcessEnv;
};

export async function compileLatexDocument(
  input: CompileLatexDocumentInput
): Promise<TectonicCompileResult> {
  let tectonic: TectonicCommand;

  try {
    tectonic = await resolveTectonicCommand(input.tectonic);
  } catch (error) {
    const diagnosticsPath = join(input.outDir, 'tectonic-install.log');
    const message = error instanceof Error ? error.message : 'Failed to resolve Tectonic.';
    await mkdir(input.outDir, { recursive: true });
    await writeFile(diagnosticsPath, message, 'utf8');
    return {
      ok: false,
      code: null,
      stdout: '',
      stderr: message,
      diagnosticsPath
    };
  }

  const nodeStyleCommand =
    tectonic.command === process.execPath ||
    /(?:^|[\\/])node(?:\.exe)?$/i.test(tectonic.command);
  const args = nodeStyleCommand
    ? [...(tectonic.args ?? []), '-X', 'compile', '--outdir', input.outDir, input.texPath]
    : [
        '-X',
        'compile',
        '--outdir',
        input.outDir,
        ...((tectonic.args ?? []).filter((value) => value.length > 0)),
        input.texPath
      ];

  await mkdir(input.outDir, { recursive: true });

  try {
    const rawTex = await readFile(input.texPath, 'utf8');
    const sanitized = sanitizeForTectonic(rawTex);
    if (sanitized !== rawTex) {
      // #region agent log
      fetch('http://127.0.0.1:7523/ingest/f8ff69c0-aa7e-4d26-8e6f-026a796070cc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'b525c0' },
        body: JSON.stringify({
          sessionId: 'b525c0',
          runId: 'pre-fix',
          hypothesisId: 'H5',
          location: 'tectonic.ts:sanitizeForTectonic',
          message: 'tectonic rewrote tex for compat (line comment)',
          data: {
            texPath: input.texPath,
            rawLineCount: rawTex.split(/\r?\n/).length,
            sanitizedLineCount: sanitized.split(/\r?\n/).length
          },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      await writeFile(input.texPath, sanitized, 'utf8');
    }
  } catch {
    // If we can't read/write the file, let Tectonic handle it and report errors.
  }

  return await new Promise<TectonicCompileResult>((resolve) => {
    const child = spawn(tectonic.command, args, {
      env: input.env ?? process.env,
      shell: false
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', async (error) => {
      const diagnosticsPath = join(input.outDir, 'tectonic-error.log');
      await writeFile(diagnosticsPath, `${error.message}\n${stderr || stdout}`.trim(), 'utf8');
      resolve({
        ok: false,
        code: null,
        stdout,
        stderr: error.message,
        diagnosticsPath
      });
    });

    child.on('close', async (code) => {
      const pdfPath = input.texPath.replace(/\.tex$/i, '.pdf');
      const diagnosticsPath = join(input.outDir, 'tectonic.log');
      const diagnostics = `${stdout}${stdout && stderr ? '\n' : ''}${stderr}`.trim();
      await writeFile(diagnosticsPath, diagnostics, 'utf8');

      if (code === 0 && existsSync(pdfPath)) {
        resolve({
          ok: true,
          pdfPath,
          stdout,
          stderr,
          diagnosticsPath
        });
        return;
      }

      resolve({
        ok: false,
        code,
        stdout,
        stderr,
        diagnosticsPath
      });
    });
  });
}
