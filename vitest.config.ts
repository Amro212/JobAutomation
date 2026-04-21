import { defineConfig } from 'vitest/config';

import { workspaceProjects } from './vitest.workspace';

export default defineConfig({
  test: {
    maxWorkers: 1,
    minWorkers: 1,
    projects: workspaceProjects
  }
});
