import path from 'node:path';

const PROD_USER_DATA_DIR = 'JobAutomation';
const DEV_USER_DATA_DIR = 'JobAutomationDev';

export function resolveDesktopUserDataPath(input: {
  appDataPath: string;
  packaged: boolean;
}): string {
  return path.join(
    input.appDataPath,
    input.packaged ? PROD_USER_DATA_DIR : DEV_USER_DATA_DIR
  );
}

export function resolveDefaultDbPath(userDataPath: string): string {
  return path.join(userDataPath, 'jobautomation.sqlite');
}

function isPathInside(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function shouldResetProductionDbPath(input: {
  packaged: boolean;
  userDataPath: string;
  dbPath?: string | null;
}): boolean {
  if (!input.packaged || !input.dbPath) {
    return false;
  }

  return !isPathInside(input.userDataPath, input.dbPath);
}
