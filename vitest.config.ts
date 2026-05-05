import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/vitest/**/*.test.ts'],
    exclude: [
      'node_modules/**',
      'packages/domain/src/sgp-lifted/**',
      'tests/sgp-lifted/**',
      'dist/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'packages/contracts/src/**/*.ts',
        'packages/domain/src/**/*.ts',
        'packages/pki-pades/src/**/*.ts',
        'services/*/src/**/*.ts',
      ],
      exclude: [
        'packages/domain/src/sgp-lifted/**',
        '**/dist/**',
        '**/*.d.ts',
      ],
    },
    projects: [
      {
        test: {
          name: 'contracts',
          include: ['tests/vitest/contracts/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'domain',
          include: ['tests/vitest/domain/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'services',
          include: ['tests/vitest/services/**/*.test.ts'],
        },
      },
    ],
  },
});
