import { chromium, type Browser, type LaunchOptions } from 'playwright';

export async function createDiscoveryBrowser(
  options: LaunchOptions = {}
): Promise<Browser> {
  const launchOptions = {
    headless: true,
    ...options
  };

  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      launchOptions.channel ||
      !message.includes("Executable doesn't exist")
    ) {
      throw error;
    }

    return chromium.launch({
      ...launchOptions,
      channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge'
    });
  }
}
