import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { resolveTectonicCommand, type ResolvedTectonicCommand } from './resolve-tectonic';

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
