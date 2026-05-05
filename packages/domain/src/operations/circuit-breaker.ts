export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export type EndpointCircuitSnapshot = Readonly<{
  tenantId: string;
  environment: string;
  endpointName: string;
  endpointUrl?: string | undefined;
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  openedAt?: string | undefined;
  halfOpenedAt?: string | undefined;
  lastFailureAt?: string | undefined;
  lastSuccessAt?: string | undefined;
  lastErrorCode?: string | undefined;
}>;

export type CircuitBreakerPolicy = Readonly<{
  failureThreshold: number;
  halfOpenSuccessThreshold: number;
  openCooldownMs: number;
}>;

export type CircuitBreakerDecision = Readonly<{
  action: 'allow' | 'defer';
  state: CircuitBreakerState;
  reason: string;
  nextCheckAt?: string | undefined;
}>;

export type CircuitBreakerAuditCommand = Readonly<{
  tenantId: string;
  environment: string;
  endpointName: string;
  endpointUrl?: string | undefined;
  fromState: CircuitBreakerState;
  toState: CircuitBreakerState;
  reason: string;
  occurredAt: string;
  failureCount: number;
  successCount: number;
  errorCode?: string | undefined;
}>;

export type CircuitBreakerOutcomeResult = Readonly<{
  snapshot: EndpointCircuitSnapshot;
  audit?: CircuitBreakerAuditCommand | undefined;
}>;

export const DEFAULT_CIRCUIT_BREAKER_POLICY: CircuitBreakerPolicy = {
  failureThreshold: 3,
  halfOpenSuccessThreshold: 1,
  openCooldownMs: 300_000,
};

export function decideCircuitBreakerState(input: Readonly<{
  snapshot?: EndpointCircuitSnapshot | undefined;
  now: Date;
  policy?: Partial<CircuitBreakerPolicy> | undefined;
}>): CircuitBreakerDecision {
  const policy = normalizeCircuitPolicy(input.policy);
  const snapshot = input.snapshot;

  if (!snapshot || snapshot.state === 'CLOSED' || snapshot.state === 'HALF_OPEN') {
    return {
      action: 'allow',
      state: snapshot?.state ?? 'CLOSED',
      reason: snapshot?.state === 'HALF_OPEN'
        ? 'Circuit is half-open; allowing probe submission.'
        : 'Circuit is closed.',
    };
  }

  const openedAtMs = snapshot.openedAt
    ? Date.parse(snapshot.openedAt)
    : input.now.getTime();
  const nextCheckAt = new Date(openedAtMs + policy.openCooldownMs);

  if (input.now.getTime() < nextCheckAt.getTime()) {
    return {
      action: 'defer',
      state: 'OPEN',
      reason: 'Circuit is open; submission is deferred.',
      nextCheckAt: nextCheckAt.toISOString(),
    };
  }

  return {
    action: 'allow',
    state: 'HALF_OPEN',
    reason: 'Circuit cooldown elapsed; allowing half-open probe.',
  };
}

export function recordCircuitBreakerOutcome(input: Readonly<{
  snapshot: EndpointCircuitSnapshot;
  outcome: 'success' | 'failure';
  now: Date;
  errorCode?: string | undefined;
  policy?: Partial<CircuitBreakerPolicy> | undefined;
}>): EndpointCircuitSnapshot {
  const policy = normalizeCircuitPolicy(input.policy);
  const nowIso = input.now.toISOString();

  if (input.outcome === 'success') {
    const successCount =
      input.snapshot.state === 'HALF_OPEN'
        ? input.snapshot.successCount + 1
        : 1;
    const shouldClose =
      input.snapshot.state !== 'HALF_OPEN' ||
      successCount >= policy.halfOpenSuccessThreshold;

    return {
      ...input.snapshot,
      state: shouldClose ? 'CLOSED' : 'HALF_OPEN',
      failureCount: 0,
      successCount,
      openedAt: shouldClose ? undefined : input.snapshot.openedAt,
      halfOpenedAt: shouldClose ? undefined : input.snapshot.halfOpenedAt,
      lastSuccessAt: nowIso,
      lastErrorCode: shouldClose ? undefined : input.snapshot.lastErrorCode,
    };
  }

  const failureCount = input.snapshot.failureCount + 1;
  const shouldOpen =
    input.snapshot.state === 'HALF_OPEN' ||
    failureCount >= policy.failureThreshold;

  return {
    ...input.snapshot,
    state: shouldOpen ? 'OPEN' : 'CLOSED',
    failureCount,
    successCount: 0,
    openedAt: shouldOpen ? nowIso : input.snapshot.openedAt,
    halfOpenedAt: undefined,
    lastFailureAt: nowIso,
    lastErrorCode: input.errorCode,
  };
}

export function recordCircuitBreakerOutcomeWithAudit(input: Readonly<{
  snapshot: EndpointCircuitSnapshot;
  outcome: 'success' | 'failure';
  now: Date;
  reason?: string | undefined;
  errorCode?: string | undefined;
  policy?: Partial<CircuitBreakerPolicy> | undefined;
}>): CircuitBreakerOutcomeResult {
  const next = recordCircuitBreakerOutcome(input);
  if (next.state === input.snapshot.state) {
    return { snapshot: next };
  }

  return {
    snapshot: next,
    audit: buildCircuitBreakerAuditCommand({
      from: input.snapshot,
      to: next,
      reason: input.reason ?? defaultTransitionReason(input.snapshot.state, next.state),
      occurredAt: input.now.toISOString(),
      errorCode: input.errorCode,
    }),
  };
}

export function buildCircuitBreakerAuditCommand(input: Readonly<{
  from: EndpointCircuitSnapshot;
  to: EndpointCircuitSnapshot;
  reason: string;
  occurredAt: string;
  errorCode?: string | undefined;
}>): CircuitBreakerAuditCommand {
  return {
    tenantId: input.to.tenantId,
    environment: input.to.environment,
    endpointName: input.to.endpointName,
    endpointUrl: input.to.endpointUrl,
    fromState: input.from.state,
    toState: input.to.state,
    reason: input.reason,
    occurredAt: input.occurredAt,
    failureCount: input.to.failureCount,
    successCount: input.to.successCount,
    errorCode: input.errorCode ?? input.to.lastErrorCode,
  };
}

function normalizeCircuitPolicy(
  policy?: Partial<CircuitBreakerPolicy>,
): CircuitBreakerPolicy {
  return {
    ...DEFAULT_CIRCUIT_BREAKER_POLICY,
    ...policy,
  };
}

function defaultTransitionReason(
  from: CircuitBreakerState,
  to: CircuitBreakerState,
): string {
  if (from === 'CLOSED' && to === 'OPEN') return 'failure threshold reached';
  if (from === 'OPEN' && to === 'HALF_OPEN') return 'cooldown elapsed';
  if (from === 'HALF_OPEN' && to === 'CLOSED') return 'half-open probe succeeded';
  if (from === 'HALF_OPEN' && to === 'OPEN') return 'half-open probe failed';
  return `${from} -> ${to}`;
}
