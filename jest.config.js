const baseConfig = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
      },
    }],
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
};

module.exports = {
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'lib/**/*.ts',
    'nodes/**/*.ts',
    'credentials/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
  projects: [
    {
      ...baseConfig,
      displayName: 'unit',
      testMatch: [
        '<rootDir>/tests/unit/**/*.test.ts',
        '<rootDir>/tests/tools/**/*.test.ts',
      ],
    },
    {
      ...baseConfig,
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      // Run in band to prevent database race conditions
      maxWorkers: 1,
    },
    {
      ...baseConfig,
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      // Run in band to prevent database race conditions
      maxWorkers: 1,
    },
  ],
};
