import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import {
  Camoufox,
  launchOptions as buildCamoufoxLaunchOptions,
  type LaunchOptions as CamoufoxLaunchOptions
} from 'camoufox-js';
import {
  firefox,
  type Browser,
  type BrowserContext,
  type BrowserType,
  type LaunchOptions
} from 'playwright';

import type { SupportedApplicationBoard } from '../apply/board-entry';

const CAMOUFOX_INSTALL_COMMAND = 'corepack pnpm browser:install';

type CamoufoxLauncher = (options: CamoufoxLaunchOptions) => Promise<Browser>;
type CamoufoxOptionsFactory = (
  options: Omit<CamoufoxLaunchOptions, 'headless'> & { headless?: boolean }
) => Promise<Record<string, unknown>>;
type PersistentBrowserType = Pick<BrowserType<Browser>, 'launchPersistentContext'>;

export type BrowserProfileKind = 'discovery' | 'apply';

export type BrowserIdentityConfig = {
  profileKind: BrowserProfileKind;
  board?: SupportedApplicationBoard;
  userDataDir?: string;
  os: 'windows' | 'macos' | 'linux';
  locale: string | string[];
  screen?: CamoufoxLaunchOptions['screen'];
  window?: [number, number];
  fonts?: string[];
  webglConfig?: [string, string];
  enableCache: boolean;
  humanize: boolean | number;
  firefoxUserPrefs: Record<string, unknown>;
  headless: boolean;
  blockWebrtc: boolean;
  geoip: boolean;
  customFontsOnly: boolean;
};

export type ApplicationBrowserRuntime = {
  browser: Browser | null;
  context: BrowserContext | null;
  identity: BrowserIdentityConfig;
  persistent: boolean;
  close: () => Promise<void>;
};

type BuildBrowserIdentityConfigInput = Partial<
  Omit<BrowserIdentityConfig, 'profileKind' | 'board'>
> & {
  profileKind: BrowserProfileKind;
  board?: SupportedApplicationBoard;
  profilesRootDir?: string;
};

type DisplayBounds = {
  width: number;
  height: number;
};

let cachedDisplayBounds: DisplayBounds | null | undefined;

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

function resolveRuntimeLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
}

export function resolveRuntimeTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Toronto';
}

function parseDisplayBounds(value: string | undefined): DisplayBounds | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) {
    return null;
  }

  let width = Number.parseInt(match[1] ?? '', 10);
  let height = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  // Macs typically report physical pixels for Retina displays.
  // E.g. "3456 x 2234 Retina" or similar. Dividing by 2 gets us the logical bounds.
  if (/retina/i.test(value) || width >= 2560) {
    width /= 2;
    height /= 2;
  }

  return { width, height };
}

function detectDisplayBounds(): DisplayBounds | null {
  if (cachedDisplayBounds !== undefined) {
    return cachedDisplayBounds;
  }

  try {
    if (process.platform === 'darwin') {
      const output = execFileSync('system_profiler', ['SPDisplaysDataType', '-json'], {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024
      });
      const payload = JSON.parse(output) as {
        SPDisplaysDataType?: Array<{
          spdisplays_ndrvs?: Array<Record<string, unknown>>;
        }>;
      };

      const displays = payload.SPDisplaysDataType?.flatMap((gpu) => gpu.spdisplays_ndrvs ?? []) ?? [];
      const mainDisplay = displays.find(
        (display) =>
          display.spdisplays_main === 'spdisplays_yes' && display.spdisplays_online === 'spdisplays_yes'
      );
      const onlineDisplay = displays.find((display) => display.spdisplays_online === 'spdisplays_yes');
      const selectedDisplay = mainDisplay ?? onlineDisplay ?? displays[0];

      const bounds =
        parseDisplayBounds(
          typeof selectedDisplay?._spdisplays_pixels === 'string'
            ? selectedDisplay._spdisplays_pixels
            : undefined
        ) ??
        parseDisplayBounds(
          typeof selectedDisplay?._spdisplays_resolution === 'string'
            ? selectedDisplay._spdisplays_resolution
            : undefined
        ) ??
        parseDisplayBounds(
          typeof selectedDisplay?.spdisplays_pixelresolution === 'string'
            ? selectedDisplay.spdisplays_pixelresolution
            : undefined
        );

      if (bounds) {
        cachedDisplayBounds = bounds;
        return cachedDisplayBounds;
      }
    } else if (process.platform === 'win32') {
      const output = execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          'Get-CimInstance -ClassName Win32_VideoController | Select-Object -First 1 CurrentHorizontalResolution, CurrentVerticalResolution | ConvertTo-Json'
        ],
        { encoding: 'utf-8' }
      );
      
      const payload = JSON.parse(output);
      if (payload.CurrentHorizontalResolution && payload.CurrentVerticalResolution) {
        cachedDisplayBounds = {
          width: payload.CurrentHorizontalResolution,
          height: payload.CurrentVerticalResolution
        };
        return cachedDisplayBounds;
      }
    } else if (process.platform === 'linux') {
      const output = execFileSync('xrandr', ['--current'], { encoding: 'utf-8' });
      const match = output.match(/current\s+(\d+)\s*x\s*(\d+)/i);
      if (match) {
        cachedDisplayBounds = {
          width: Number.parseInt(match[1] ?? '', 10),
          height: Number.parseInt(match[2] ?? '', 10)
        };
        return cachedDisplayBounds;
      }
    }
  } catch {
    // Silently fail to fallback
  }

  cachedDisplayBounds = null;
  return cachedDisplayBounds;
}

function resolveScreenConstraint(
  identity: BrowserIdentityConfig
): CamoufoxLaunchOptions['screen'] | undefined {
  if (identity.screen || identity.window) {
    return undefined;
  }

  const display = detectDisplayBounds();
  if (!display) {
    return undefined;
  }

  // Keep randomization enabled but cap values below the active logical display bounds.
  // Standard minimum bounds for reliable browsing.
  const maxWidth = Math.max(1024, Math.floor(display.width * 0.95));
  const maxHeight = Math.max(720, Math.floor(display.height * 0.85));

  return {
    minWidth: Math.min(1024, maxWidth),
    maxWidth,
    minHeight: Math.min(720, maxHeight),
    maxHeight
  };
}

function primaryLocale(locale: string | string[]): string {
  return Array.isArray(locale) ? (locale[0] ?? resolveRuntimeLocale()) : locale;
}

function defaultApplyProfileDir(input: {
  board: SupportedApplicationBoard;
  profilesRootDir?: string;
}): string {
  const profilesRootDir =
    input.profilesRootDir ?? join(process.cwd(), 'data', 'browser-profiles');
  return join(profilesRootDir, 'apply', input.board);
}

function defaultFirefoxUserPrefs(input: {
  locale: string | string[];
  enableCache: boolean;
}): Record<string, unknown> {
  return {
    'browser.cache.disk.enable': input.enableCache,
    'browser.cache.memory.enable': input.enableCache,
    'intl.accept_languages': Array.isArray(input.locale)
      ? input.locale.join(', ')
      : input.locale
  };
}

export function buildBrowserIdentityConfig(
  input: BuildBrowserIdentityConfigInput
): BrowserIdentityConfig {
  const locale = input.locale ?? resolveRuntimeLocale();
  const enableCache = input.enableCache ?? input.profileKind === 'apply';
  const board = input.board;

  return {
    profileKind: input.profileKind,
    ...(board ? { board } : {}),
    ...(input.userDataDir
      ? { userDataDir: input.userDataDir }
      : input.profileKind === 'apply' && board
        ? {
            userDataDir: defaultApplyProfileDir({
              board,
              profilesRootDir: input.profilesRootDir
            })
          }
        : {}),
    os: input.os ?? 'windows',
    locale,
    ...(input.screen ? { screen: input.screen } : {}),
    ...(input.window ? { window: input.window } : {}),
    ...(input.fonts ? { fonts: input.fonts } : {}),
    ...(input.webglConfig ? { webglConfig: input.webglConfig } : {}),
    enableCache,
    humanize: input.humanize ?? true,
    blockWebrtc: input.blockWebrtc ?? true,
    geoip: input.geoip ?? true, // Auto-syncs locale, timezone, and coords to current IP
    customFontsOnly: input.customFontsOnly ?? (input.fonts && input.fonts.length > 0 ? true : false),
    firefoxUserPrefs: {
      ...defaultFirefoxUserPrefs({
        locale,
        enableCache
      }),
      ...(input.firefoxUserPrefs ?? {})
    },
    headless: input.headless ?? input.profileKind !== 'apply'
  };
}

function createIdentityAwareCamoufoxOptions(
  identity: BrowserIdentityConfig
): Omit<CamoufoxLaunchOptions, 'headless'> & { headless?: boolean } {
  const screenConstraint = resolveScreenConstraint(identity);

  return {
    headless: identity.headless,
    humanize: identity.humanize,
    locale: identity.locale,
    os: identity.os,
    ...(identity.screen ? { screen: identity.screen } : screenConstraint ? { screen: screenConstraint } : {}),
    ...(identity.window ? { window: identity.window } : {}),
    ...(identity.fonts ? { fonts: identity.fonts } : {}),
    ...(identity.webglConfig ? { webgl_config: identity.webglConfig } : {}),
    enable_cache: identity.enableCache,
    firefox_user_prefs: identity.firefoxUserPrefs,
    block_webrtc: identity.blockWebrtc,
    geoip: identity.geoip,
    custom_fonts_only: identity.customFontsOnly
  };
}

export async function createApplicationBrowserRuntime(input: {
  board: SupportedApplicationBoard;
  profilesRootDir?: string;
  identity?: Partial<Omit<BrowserIdentityConfig, 'profileKind' | 'board'>>;
  browserType?: PersistentBrowserType;
  launchOptionsFactory?: CamoufoxOptionsFactory;
}): Promise<ApplicationBrowserRuntime> {
  const identity = buildBrowserIdentityConfig({
    profileKind: 'apply',
    board: input.board,
    profilesRootDir: input.profilesRootDir,
    ...(input.identity ?? {})
  });

  if (!identity.userDataDir) {
    throw new Error('Apply browser runtime requires a persistent user data directory.');
  }

  const browserType = input.browserType ?? firefox;
  const launchOptionsFactory = input.launchOptionsFactory ?? buildCamoufoxLaunchOptions;

  try {
    const launchOptions = await launchOptionsFactory(
      createIdentityAwareCamoufoxOptions(identity)
    );
    const context = await browserType.launchPersistentContext(identity.userDataDir, {
      ...launchOptions
    });

    return {
      browser: context.browser(),
      context,
      identity,
      persistent: true,
      close: async () => {
        await context.close();
      }
    };
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

export async function createDiscoveryBrowser(options: LaunchOptions = {}): Promise<Browser> {
  return createBrowserWithCamoufoxLauncher(
    (launchOptions) => Camoufox(launchOptions) as Promise<Browser>,
    options
  );
}
