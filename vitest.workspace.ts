export const workspaceProjects = [
  {
    test: {
      name: 'api',
      environment: 'node',
      include: ['tests/apps/api/**/*.test.ts']
    }
  },
  {
    test: {
      name: 'dashboard',
      environment: 'node',
      include: ['tests/apps/dashboard/**/*.test.ts']
    }
  },
  {
    test: {
      name: 'core',
      environment: 'node',
      include: ['tests/packages/core/**/*.test.ts']
    }
  },
  {
    test: {
      name: 'config',
      environment: 'node',
      include: ['tests/packages/config/**/*.test.ts']
    }
  },
  {
    test: {
      name: 'db',
      environment: 'node',
      include: ['tests/packages/db/**/*.test.ts']
    }
  },
  {
    test: {
      name: 'discovery',
      environment: 'node',
      include: ['tests/packages/discovery/**/*.test.ts']
    }
  },
  {
    test: {
      name: 'automation',
      environment: 'node',
      include: ['tests/packages/automation/**/*.test.ts'],
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      testTimeout: 60_000
    }
  },
  {
    test: {
      name: 'llm',
      environment: 'node',
      include: ['tests/packages/llm/**/*.test.ts']
    }
  },
  {
    test: {
      name: 'documents',
      environment: 'node',
      include: ['tests/packages/documents/**/*.test.ts']
    }
  }
];

export default workspaceProjects;
