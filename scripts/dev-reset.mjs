import { spawnSync } from 'node:child_process';

run('docker', ['compose', '-f', 'docker-compose.dev.yml', 'down', '-v']);
run('docker', ['compose', '-f', 'docker-compose.dev.yml', 'up', '-d']);
run('npm', ['run', 'migrate:dev'], {
  ESOCIAL_DATABASE_URL: process.env.ESOCIAL_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/esocial_dev',
  ESOCIAL_MIGRATE_RESET: '1',
});
console.log('[dev:reset] local database, queues, and stub containers reset');

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
