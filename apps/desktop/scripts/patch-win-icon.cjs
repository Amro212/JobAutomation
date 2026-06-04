/**
 * afterPack hook for electron-builder.
 *
 * When `signAndEditExecutable` is set to `false` (required when code-signing
 * is not yet configured), electron-builder skips its built-in icon-stamping
 * step.  This hook uses `resedit` to patch the custom .ico into the Windows
 * executable's PE resources so the app icon shows up in Explorer, the taskbar,
 * and Alt-Tab.
 *
 * NOTE: Once code-signing is enabled, electron-builder will handle icon
 * embedding itself and this hook should be revisited / removed.
 */

const fs = require('node:fs');
const path = require('node:path');
const ResEdit = require('resedit');

const MAX_WRITE_RETRIES = 20;
const RETRY_DELAY_MS = 250;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function writeFileWithRetry(filePath, buffer) {
  for (let attempt = 0; attempt < MAX_WRITE_RETRIES; attempt += 1) {
    try {
      fs.writeFileSync(filePath, buffer);
      return;
    } catch (error) {
      if (error?.code !== 'EBUSY' || attempt === MAX_WRITE_RETRIES - 1) {
        const wrappedError = new Error(
          `Failed to write ${filePath} after ${attempt + 1} attempt(s)`
        );
        wrappedError.cause = error;
        throw wrappedError;
      }

      await sleep(RETRY_DELAY_MS);
    }
  }
}

exports.default = async function patchWinIcon(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const executableName = `${context.packager.appInfo.productFilename}.exe`;
  const executablePath = path.join(context.appOutDir, executableName);
  const iconPath = path.join(context.packager.projectDir, 'resources', 'icon.ico');

  const executable = ResEdit.NtExecutable.from(await fs.promises.readFile(executablePath));
  const resources = ResEdit.NtExecutableResource.from(executable);
  const iconFile = ResEdit.Data.IconFile.from(await fs.promises.readFile(iconPath));
  const replacementIcons = iconFile.icons.map((item) => item.data);
  const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);

  if (iconGroups.length === 0) {
    console.warn(
      '[patch-win-icon] No existing icon groups found in the executable — skipping patch. ' +
      'The win.icon field in electron-builder.yml should still embed the icon at build time.'
    );
    return;
  }

  for (const group of iconGroups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, replacementIcons);
  }

  resources.outputResource(executable);
  await writeFileWithRetry(executablePath, Buffer.from(executable.generate()));
  console.log(
    `[patch-win-icon] Patched ${executableName} icon groups ${iconGroups.map((group) => group.id).join(', ')} with ${path.basename(iconPath)}`,
  );
};
