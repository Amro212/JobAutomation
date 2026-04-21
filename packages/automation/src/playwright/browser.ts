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
  return {
    headless: identity.headless,
    humanize: identity.humanize,
    locale: identity.locale,
    os: identity.os,
    ...(identity.screen ? { screen: identity.screen } : {}),
    ...(identity.window ? { window: identity.window } : {}),
    ...(identity.fonts ? { fonts: identity.fonts } : {}),
    ...(identity.webglConfig ? { webgl_config: identity.webglConfig } : {}),
    enable_cache: identity.enableCache,
    firefox_user_prefs: identity.firefoxUserPrefs
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
      ...launchOptions,
      locale: primaryLocale(identity.locale),
      timezoneId: resolveRuntimeTimezone()
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
