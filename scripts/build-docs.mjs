import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const outDir = join(root, 'docs-site/build');
const pages = [
  ['index.html', 'Round 5 Reference Site', [
    'Production-grade eSocial service bus reference evidence.',
    'Readiness: local-safe scaffolds are present; external closure remains tracked in release evidence.',
  ]],
  ['security.html', 'Security', [
    readFileSync(join(root, 'docs/security/threat-model.md'), 'utf8').split('\n').slice(0, 8).join('\n'),
  ]],
  ['compliance.html', 'Compliance', [
    readFileSync(join(root, 'docs/compliance/lgpd-dpia.md'), 'utf8').split('\n').slice(0, 8).join('\n'),
  ]],
  ['operations.html', 'Operations', [
    readFileSync(join(root, 'docs/release/1.2.0/round-6-entry.md'), 'utf8').split('\n').slice(0, 8).join('\n'),
  ]],
];

mkdirSync(outDir, { recursive: true });
for (const [fileName, title, paragraphs] of pages) {
  writeFileSync(
    join(outDir, fileName),
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main>
    <nav><a href="index.html">Home</a><a href="security.html">Security</a><a href="compliance.html">Compliance</a><a href="operations.html">Operations</a></nav>
    <h1>${escapeHtml(title)}</h1>
    ${paragraphs.map((paragraph) => `<pre>${escapeHtml(paragraph)}</pre>`).join('\n    ')}
  </main>
</body>
</html>
`,
  );
}
writeFileSync(
  join(outDir, 'style.css'),
  `body{font-family:Inter,system-ui,sans-serif;margin:0;background:#f6f8fa;color:#14202e}main{max-width:960px;margin:0 auto;padding:32px}nav{display:flex;gap:16px;margin-bottom:32px}a{color:#075985}pre{white-space:pre-wrap;background:white;border:1px solid #d8dee4;border-radius:6px;padding:16px;line-height:1.5}h1{font-size:32px;letter-spacing:0}\n`,
);

writeFileSync(
  join(root, 'docs/release/1.2.0/reference-site/build.json'),
  `${JSON.stringify({
    status: 'passed',
    output: 'docs-site/build',
    pages: pages.map(([fileName]) => fileName),
  }, null, 2)}\n`,
);
console.log(`[docs:build] wrote ${pages.length} reference page(s)`);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
