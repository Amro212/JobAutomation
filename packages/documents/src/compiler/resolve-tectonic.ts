import { existsSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const TECTONIC_RELEASE_TAG = 'tectonic@0.15.0';

export type ResolvedTectonicCommand = {
  command: string;
  args: string[];
};

function normalizeArgs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === 'string');
}

export function defaultTectonicCommand(): ResolvedTectonicCommand {
  const command = process.env.JOB_AUTOMATION_TECTONIC_COMMAND ?? 'tectonic';
  const argsJson = process.env.JOB_AUTOMATION_TECTONIC_ARGS_JSON;

  if (argsJson) {
    try {
      return {
        command,
        args: normalizeArgs(JSON.parse(argsJson))
      };
    } catch {
      return { command, args: [] };
    }
  }

  return { command, args: [] };
}

function isAvailable(command: string): boolean {
  const result = spawnSync(command, ['--version'], {
    shell: false,
    stdio: 'ignore'
  });

  return !result.error && result.status === 0;
}

function isTectonicCommandName(command: string): boolean {
  return /(?:^|[\\/])tectonic(?:\.exe)?$/i.test(command);
}

function getPlatformAssetName(): string {
  if (process.platform === 'win32') {
    return 'tectonic-0.15.0-x86_64-pc-windows-msvc.zip';
  }

  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? 'tectonic-0.15.0-aarch64-apple-darwin.tar.gz'
      : 'tectonic-0.15.0-x86_64-apple-darwin.tar.gz';
  }

  if (process.arch === 'arm64') {
    return 'tectonic-0.15.0-aarch64-unknown-linux-musl.tar.gz';
  }

  return 'tectonic-0.15.0-x86_64-unknown-linux-gnu.tar.gz';
}

async function downloadAsset(downloadUrl: string, outputPath: string): Promise<void> {
  const response = await fetch(downloadUrl, {
    headers: {
      'User-Agent': 'JobAutomation/1.0'
    }
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download Tectonic asset: ${response.status} ${response.statusText}`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await pipeline(response.body, createWriteStream(outputPath));
}

async function extractArchive(archivePath: string, outputDir: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });

  if (process.platform === 'win32') {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${outputDir.replace(/'/g, "''")}' -Force`
      ],
      { shell: false, stdio: 'ignore' }
    );

    if (result.error || result.status !== 0) {
      throw new Error('Failed to extract the Tectonic archive on Windows.');
    }

    return;
  }

  const result = spawnSync('tar', ['-xzf', archivePath, '-C', outputDir], {
    shell: false,
    stdio: 'ignore'
  });

  if (result.error || result.status !== 0) {
    throw new Error('Failed to extract the Tectonic archive.');
  }
}

function findBinaryPath(rootDir: string): string | null {
  const expectedName = process.platform === 'win32' ? 'tectonic.exe' : 'tectonic';
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (existsSync(join(current, expectedName))) {
      return join(current, expectedName);
    }

    try {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          stack.push(join(current, entry.name));
        }
      }
    } catch {
      // Ignore directories we cannot read and keep searching.
    }
  }

  return null;
}

async function installBundledTectonic(): Promise<ResolvedTectonicCommand> {
  const cacheDir = process.env.JOB_AUTOMATION_TECTONIC_CACHE_DIR
    ? resolve(process.env.JOB_AUTOMATION_TECTONIC_CACHE_DIR)
    : join(process.cwd(), 'data', 'tectonic');
  const installDir = join(cacheDir, TECTONIC_RELEASE_TAG, process.platform, process.arch);
  const assetName = getPlatformAssetName();
  const archivePath = join(installDir, assetName);
  const extractDir = join(installDir, 'extract');
  const assetUrl = `https://github.com/tectonic-typesetting/tectonic/releases/download/${TECTONIC_RELEASE_TAG}/${assetName}`;

  if (process.platform !== 'win32' && process.platform !== 'darwin' && process.platform !== 'linux') {
    throw new Error(`Unsupported platform for automatic Tectonic installation: ${process.platform}`);
  }

  const expectedBinary = join(extractDir, process.platform === 'win32' ? 'tectonic.exe' : 'tectonic');
  if (existsSync(expectedBinary)) {
    return {
      command: expectedBinary,
      args: []
    };
  }

  await mkdir(installDir, { recursive: true });
  await downloadAsset(assetUrl, archivePath);
  await extractArchive(archivePath, extractDir);

  const binaryPath = findBinaryPath(extractDir);
  if (!binaryPath) {
    throw new Error('Could not locate the downloaded Tectonic binary.');
  }

  return {
    command: binaryPath,
    args: []
  };
}

export async function resolveTectonicCommand(
  input?: ResolvedTectonicCommand
): Promise<ResolvedTectonicCommand> {
  if (input) {
    return input;
  }

  const configured = defaultTectonicCommand();
  if (configured.command && configured.command !== 'tectonic') {
    if (isAvailable(configured.command)) {
      return configured;
    }

    if (isTectonicCommandName(configured.command)) {
      return installBundledTectonic();
    }

    throw new Error(`Configured Tectonic command was not found: ${configured.command}`);
  }

  if (isAvailable(configured.command)) {
    return configured;
  }

  return installBundledTectonic();
}
