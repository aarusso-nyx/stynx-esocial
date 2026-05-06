import type { EventClass, TenantId } from '@esocial/contracts';
import {
  makeCnpj,
  makeCpf,
  makeEventClass,
  makeTenantId,
} from '@esocial/contracts';

const tenantId: TenantId = makeTenantId('00000000-0000-4000-8000-000000000101');
const eventClass: EventClass = makeEventClass('S-1299');

function needsTenantId(value: TenantId): TenantId {
  return value;
}

function needsEventClass(value: EventClass): EventClass {
  return value;
}

needsTenantId(tenantId);
needsEventClass(eventClass);

// @ts-expect-error branded tenant IDs cannot be used as event classes.
needsEventClass(tenantId);

// @ts-expect-error raw strings must pass through contract constructors.
needsTenantId('00000000-0000-4000-8000-000000000101');

makeCnpj('11.222.333/0001-81');
makeCpf('123.456.789-09');
