import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../../..', import.meta.url).pathname;
const code = (process.argv[2] ?? '').toUpperCase();

if (!/^S-\d{4}$/u.test(code)) {
  console.error('Usage: npm run dev:family -- S-1099');
  process.exit(1);
}

const slug = code.toLowerCase().replace('-', '');
const files = [
  [`packages/contracts/src/dtos/${slug}.ts`, `export type ${slugType(slug)}Dto = Readonly<{\n  eventClass: '${code}';\n  tenantId: string;\n  sourceEventId: string;\n  sourceEntityId?: string | undefined;\n  environment?: 'production' | 'qualification' | undefined;\n}>;\n`],
  [`packages/domain/src/builders/${slug}/builder.ts`, `import type { ${slugType(slug)}Dto } from '@esocial/contracts';\n\nexport function build${slugType(slug)}(_dto: ${slugType(slug)}Dto): never {\n  throw new Error('${code} builder scaffold requires leiaute mapping and golden XML.');\n}\n`],
  [`tests/golden/${slug}.test.ts`, `import { describe, it } from 'node:test';\n\ndescribe('${code} golden XML', () => {\n  it('is scaffolded for promotion', () => {\n    // TODO: replace with DTO -> XML golden assertion.\n  });\n});\n`],
  [`tests/golden/fixtures/${slug}.dto.json`, `${JSON.stringify({
    eventClass: code,
    tenantId: '00000000-0000-4000-8000-000000000000',
    sourceEventId: `${slug}-source-event`,
    environment: 'qualification',
  }, null, 2)}\n`],
];

for (const [relativePath, contents] of files) {
  const absolutePath = join(root, relativePath);
  mkdirSync(join(absolutePath, '..'), { recursive: true });
  writeFileSync(absolutePath, contents, { flag: 'wx' });
  console.log(`[dev:family] created ${relativePath}`);
}

console.log('[dev:family] next steps: add DTO export, map dispatcher route, replace TODO builder, add XSD/golden assertions.');

function slugType(value) {
  return value.toUpperCase();
}
