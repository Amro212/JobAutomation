import { workerData } from 'node:worker_threads';

import { tsImport } from 'tsx/esm/api';

if (!workerData?.__tsxWorkerEntry) {
  throw new Error('Missing TypeScript autopilot worker entry.');
}

await tsImport(workerData.__tsxWorkerEntry, import.meta.url);
