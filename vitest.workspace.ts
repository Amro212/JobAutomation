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
      include: ['tests/packages/automation/**/*.test.ts']
    }
  }
];

export default workspaceProjects;
