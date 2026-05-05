import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const composeFile = 'tests/db/docker-compose.yml';
const projectName = `esocial-db-${process.pid}`;
const externalAdminUrl = process.env.ESOCIAL_TEST_ADMIN_URL ?? process.env.DATABASE_URL;

if (externalAdminUrl) {
  runDbTests({ ESOCIAL_TEST_ADMIN_URL: externalAdminUrl });
  console.log('[test:db] external PostgreSQL supplied; cold-start time 0ms');
} else {
  const port = process.env.ESOCIAL_TEST_DB_PORT ?? '55432';
  const adminUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  const startedAt = Date.now();

  try {
    dockerCompose(['up', '-d'], { ESOCIAL_TEST_DB_PORT: port });
    waitForPostgres(adminUrl);
    const readyMs = Date.now() - startedAt;
    console.log(`[test:db] ephemeral PostgreSQL ready in ${readyMs}ms on port ${port}`);
    runDbTests({ ESOCIAL_TEST_ADMIN_URL: adminUrl });
    console.log(`[test:db] cold-start time ${readyMs}ms`);
  } finally {
    if (process.env.ESOCIAL_TEST_DB_KEEP !== '1') {
      dockerCompose(['down', '-v', '--remove-orphans'], {
        ESOCIAL_TEST_DB_PORT: port,
      });
    }
  }
}

function runDbTests(extraEnv) {
  const testFiles = readdirSync(join(root, 'tests/db'))
    .filter((fileName) => fileName.endsWith('.test.mjs'))
    .sort()
    .map((fileName) => `tests/db/${fileName}`);
  const result = spawnSync(
    process.execPath,
    ['--test', ...testFiles],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw new Error(`[test:db] failed to start node test runner: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[test:db] database tests failed with exit code ${result.status}`);
  }
}

function waitForPostgres(adminUrl) {
  const deadline = Date.now() + 30_000;
  let lastError = '';

  while (Date.now() < deadline) {
    const result = spawnSync(
      'psql',
      ['-X', '-v', 'ON_ERROR_STOP=1', adminUrl, '-Atc', 'SELECT 1'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    if (result.status === 0 && result.stdout.trim() === '1') {
      return;
    }

    lastError = result.stderr.trim();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }

  throw new Error(`[test:db] PostgreSQL did not become ready: ${lastError}`);
}

function dockerCompose(args, extraEnv) {
  const result = spawnSync(
    'docker',
    ['compose', '-p', projectName, '-f', composeFile, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw new Error(`[test:db] failed to start docker compose: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`[test:db] docker compose ${args.join(' ')} failed`);
  }
}
