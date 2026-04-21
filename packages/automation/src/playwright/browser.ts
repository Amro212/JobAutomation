import { Camoufox, type LaunchOptions as CamoufoxLaunchOptions } from 'camoufox-js';
import type { Browser, LaunchOptions } from 'playwright';

const CAMOUFOX_INSTALL_COMMAND = 'corepack pnpm browser:install';

type CamoufoxLauncher = (options: CamoufoxLaunchOptions) => Promise<Browser>;

function createCamoufoxLaunchOptions(options: LaunchOptions): CamoufoxLaunchOptions {
  const launchOptions = { ...options };
  delete launchOptions.channel;

  return {
    headless: true,
    humanize: true,
    locale: 'en-US',
    os: 'windows',
    ...launchOptions
  };
}

function isMissingCamoufoxBinaryError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Executable doesn't exist") ||
    /camoufox.+fetch/i.test(message) ||
    /executable path/i.test(message)
  );
}

export async function createBrowserWithCamoufoxLauncher(
  launcher: CamoufoxLauncher,
  options: LaunchOptions = {}
): Promise<Browser> {
  const launchOptions = createCamoufoxLaunchOptions(options);

  try {
    return await launcher(launchOptions);
  } catch (error) {
    if (isMissingCamoufoxBinaryError(error)) {
      throw new Error(
        `Camoufox browser binary is missing. Run \`${CAMOUFOX_INSTALL_COMMAND}\` from the repository root.`,
        { cause: error }
      );
    }

    throw error;
  }
}

export async function createDiscoveryBrowser(
  options: LaunchOptions = {}
): Promise<Browser> {
  return createBrowserWithCamoufoxLauncher(
    (launchOptions) => Camoufox(launchOptions) as Promise<Browser>,
    options
  );
}
