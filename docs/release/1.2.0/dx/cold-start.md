# Fresh Clone Cold Start

Status: repository workflow added, local Docker timing not executed in this
Codex run.

The weekly `Dev Stack Cold Start` workflow now runs `npm ci`, `npm run dev:up`,
a health canary, and `npm run dev:down` on a fresh GitHub-hosted runner and
uploads this timing artifact. Round 6 cannot honestly mark the `< 5 min`
fresh-clone target closed until that workflow has a completed run URL.

## Local Attempt

- Date: `2026-05-06`
- Result: not executed locally; this workspace did not start the Docker stack
  during the Round 6 implementation pass.
- Required closing evidence: workflow URL, runner CPU/RAM, Docker version,
  `npm ci` time, `dev:up` time, first healthcheck time, and `dev:down` time.
