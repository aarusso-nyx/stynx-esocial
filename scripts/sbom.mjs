import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const outFile = valueAfter('--out') ?? 'sbom/contracts-active-services.cdx.json';
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
const rootPackage = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const componentPaths = [
  'packages/contracts',
  'packages/domain',
  'packages/pki-pades',
  'services/submission',
  'services/retorno',
  'services/certificado',
  'services/http-gateway',
  'services/shared',
  'infra/cdk',
];

const components = [];
for (const componentPath of componentPaths) {
  const packageJson = JSON.parse(readFileSync(join(root, componentPath, 'package.json'), 'utf8'));
  components.push({
    type: 'library',
    'bom-ref': `workspace:${componentPath}`,
    name: packageJson.name,
    version: packageJson.version ?? rootPackage.version,
    scope: packageJson.private === false ? 'required' : 'optional',
    purl: `pkg:npm/${encodeURIComponent(packageJson.name)}@${packageJson.version ?? rootPackage.version}`,
    properties: [{ name: 'esocial:workspacePath', value: componentPath }],
  });
}

for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
  if (!packagePath.startsWith('node_modules/') || !metadata.version) continue;
  const name = packagePath.replace(/^node_modules\//u, '');
  components.push({
    type: 'library',
    'bom-ref': `npm:${name}@${metadata.version}`,
    name,
    version: metadata.version,
    scope: metadata.dev ? 'optional' : 'required',
    purl: `pkg:npm/${encodeURIComponent(name)}@${metadata.version}`,
    licenses: metadata.license ? [{ license: { name: metadata.license } }] : undefined,
  });
}

components.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: 'urn:uuid:00000000-0000-4000-8000-000000000100',
  version: 1,
  metadata: {
    timestamp: '2026-05-05T00:00:00.000Z',
    tools: [{ vendor: 'esocial', name: 'scripts/sbom.mjs', version: rootPackage.version }],
    component: {
      type: 'application',
      name: rootPackage.name,
      version: rootPackage.version,
      'bom-ref': 'workspace:root',
    },
  },
  components,
};

const absoluteOutFile = join(root, outFile);
mkdirSync(dirname(absoluteOutFile), { recursive: true });
writeFileSync(absoluteOutFile, `${JSON.stringify(bom, null, 2)}\n`);
console.log(`[sbom] wrote ${relative(root, absoluteOutFile)} (${components.length} components)`);

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
