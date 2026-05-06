import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const args = process.argv.slice(2);
const outFile = valueAfter('--out') ?? 'sbom/contracts-active-services.cdx.json';
const format = valueAfter('--format') ?? (outFile.endsWith('.spdx.json') ? 'spdx' : 'cyclonedx');
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

const bom = format === 'spdx' ? spdxDocument() : cycloneDxDocument();

const absoluteOutFile = join(root, outFile);
mkdirSync(dirname(absoluteOutFile), { recursive: true });
writeFileSync(absoluteOutFile, `${JSON.stringify(bom, null, 2)}\n`);
console.log(`[sbom] wrote ${relative(root, absoluteOutFile)} (${components.length} components, ${format})`);

function cycloneDxDocument() {
  return {
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
}

function spdxDocument() {
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: `${rootPackage.name}-${rootPackage.version}`,
    documentNamespace: `https://stynx.local/esocial/sbom/${rootPackage.version}`,
    creationInfo: {
      created: '2026-05-06T13:00:00Z',
      creators: ['Tool: scripts/sbom.mjs'],
    },
    packages: components.map((component, index) => ({
      name: component.name,
      SPDXID: `SPDXRef-Package-${index + 1}`,
      versionInfo: component.version,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: component.licenses?.[0]?.license?.name ?? 'NOASSERTION',
      externalRefs: component.purl
        ? [{
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: component.purl,
          }]
        : [],
    })),
  };
}

function valueAfter(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
