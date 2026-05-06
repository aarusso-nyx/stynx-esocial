/* global module */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
module.exports = {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: {
    related: false,
  },
  coverageAnalysis: 'perTest',
  checkers: ['typescript'],
  tsconfigFile: 'packages/domain/tsconfig.json',
  mutate: [
    'packages/domain/src/**/*.ts',
    '!packages/domain/src/sgp-lifted/**',
    '!packages/domain/src/**/*.d.ts',
  ],
  reporters: ['clear-text', 'progress', 'html', 'json'],
  thresholds: {
    high: 80,
    low: 70,
    break: 70,
  },
  tempDirName: '.stryker-tmp/domain',
  jsonReporter: {
    fileName: 'docs/release/1.2.0/mutation/domain-stryker.json',
  },
  htmlReporter: {
    fileName: 'docs/release/1.2.0/mutation/domain-html',
  },
};
