import { spawnSync } from 'node:child_process';

const started = Date.now();
run('docker', ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d']);
run('npm', ['run', 'migrate:dev'], {
  ESOCIAL_DATABASE_URL: process.env.ESOCIAL_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/esocial_dev',
  ESOCIAL_MIGRATE_RESET: process.env.ESOCIAL_MIGRATE_RESET ?? '0',
});

console.log('[dev:up] local eSocial stack started');
console.log(`[dev:up] cold-start elapsed ${Math.round((Date.now() - started) / 1000)}s`);
console.log('[dev:up] Postgres: postgresql://postgres:postgres@localhost:5432/esocial_dev');
console.log('[dev:up] LocalStack: http://localhost:4566');
console.log('[dev:up] SOAP stub fixture host: http://localhost:3010');
console.log('[dev:up] Health canary: npm run test:e2e');

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
