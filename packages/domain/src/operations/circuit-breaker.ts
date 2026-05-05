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

function normalizeCircuitPolicy(
  policy?: Partial<CircuitBreakerPolicy>,
): CircuitBreakerPolicy {
  return {
    ...DEFAULT_CIRCUIT_BREAKER_POLICY,
    ...policy,
  };
}
