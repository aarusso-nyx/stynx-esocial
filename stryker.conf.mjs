export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  vitest: {
    related: false,
  },
  mutate: ['packages/domain/src/builders/**/*.ts'],
  mutator: { excludedMutations: ['StringLiteral'] },
  thresholds: { high: 80, low: 70, break: 70 },
  reporters: ['progress', 'clear-text', 'html', 'json'],
  htmlReporter: { fileName: '.stryker-tmp/mutation-report.html' },
  jsonReporter: { fileName: '.stryker-tmp/mutation-report.json' },
};
