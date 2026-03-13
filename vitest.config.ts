import { defineConfig } from 'vitest/config';

import { workspaceProjects } from './vitest.workspace';

export default defineConfig({
  test: {
    projects: workspaceProjects
  }
});
