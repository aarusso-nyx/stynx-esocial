import { readFileSync } from 'node:fs';

const root = new URL('../..', import.meta.url).pathname;
const openapi = readFileSync(`${root}/openapi.yaml`, 'utf8');
const asyncapi = readFileSync(`${root}/asyncapi.yaml`, 'utf8');

const routes = [
  '/dlq:',
  '/dlq/{id}/replay:',
  '/lgpd/access:',
  '/lgpd/erase:',
  '/lgpd/export:',
  '/audit/verify:',
];
const channels = [
  'esocial.request.v1:',
  'esocial.response.v1:',
  'esocial.spool.v1:',
  'esocial.audit.v1:',
  'esocial.retry.v1:',
  'esocial.dlq.v1:',
  'esocial.replay.v1:',
];
const schemas = [
  './schemas/v1/request.schema.json',
  './schemas/v1/response.schema.json',
  './schemas/v1/spool.schema.json',
  './schemas/v1/audit.schema.json',
  './schemas/v1/retry.schema.json',
  './schemas/v1/dlq.schema.json',
  './schemas/v1/replay.schema.json',
];

for (const route of routes) {
  assertIncludes(openapi, route, `OpenAPI route ${route}`);
}
for (const channel of channels) {
  assertIncludes(asyncapi, channel, `AsyncAPI channel ${channel}`);
}
for (const schema of schemas) {
  assertIncludes(asyncapi, schema, `AsyncAPI schema ref ${schema}`);
}
assertIncludes(openapi, 'sigv4:', 'OpenAPI SigV4 auth scheme');
assertIncludes(openapi, 'oidc:', 'OpenAPI OIDC auth scheme');
assertIncludes(openapi, 'validation', 'OpenAPI canonical error categories');

console.log('[specs:check] OpenAPI and AsyncAPI contract canaries passed');

function assertIncludes(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} missing`);
  }
}
