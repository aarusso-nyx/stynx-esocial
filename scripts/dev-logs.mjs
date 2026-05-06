import { spawnSync } from 'node:child_process';

const result = spawnSync('docker', ['compose', '-f', 'docker-compose.dev.yml', 'logs', '-f'], {
  stdio: 'inherit',
});
process.exit(result.status ?? 0);
