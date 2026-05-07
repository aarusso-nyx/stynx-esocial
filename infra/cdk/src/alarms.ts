export type EsocialAlarmName =
  | 'RejectedRateAlarm'
  | 'DlqGrowthAlarm'
  | 'SoapLatencyP99Alarm'
  | 'CertificateExpiringAlarm'
  | 'CircuitOpenAlarm';

export type EsocialAlarmDeclaration = Readonly<{
  name: EsocialAlarmName;
  metricName: string;
  statistic: 'Sum' | 'Average' | 'p99' | 'Maximum' | 'Minimum';
  threshold: number;
  comparison: 'GreaterThanThreshold' | 'GreaterThanOrEqualToThreshold' | 'LessThanThreshold';
  evaluationPeriods: number;
  periodSeconds: number;
  description: string;
}>;

export const ESOCIAL_ALARM_REGISTRY: readonly EsocialAlarmDeclaration[] = [
  {
    name: 'RejectedRateAlarm',
    metricName: 'esocial.rejected',
    statistic: 'Sum',
    threshold: 10,
    comparison: 'GreaterThanThreshold',
    evaluationPeriods: 1,
    periodSeconds: 60,
    description: 'Rejected eSocial responses per minute exceeded the operator threshold.',
  },
  {
    name: 'DlqGrowthAlarm',
    metricName: 'esocial.dlq',
    statistic: 'Sum',
    threshold: 0,
    comparison: 'GreaterThanThreshold',
    evaluationPeriods: 1,
    periodSeconds: 60,
    description: 'DLQ depth grew and requires triage before replay.',
  },
  {
    name: 'SoapLatencyP99Alarm',
    metricName: 'esocial.soap_latency_ms',
    statistic: 'p99',
    threshold: 5_000,
    comparison: 'GreaterThanThreshold',
    evaluationPeriods: 3,
    periodSeconds: 60,
    description: 'SOAP p99 latency exceeded the stage SLO.',
  },
  {
    name: 'CertificateExpiringAlarm',
    metricName: 'esocial.certificate_days_until_expiry',
    statistic: 'Minimum',
    threshold: 30,
    comparison: 'LessThanThreshold',
    evaluationPeriods: 1,
    periodSeconds: 86_400,
    description: 'A tenant certificate is inside the 30-day rotation window.',
  },
  {
    name: 'CircuitOpenAlarm',
    metricName: 'esocial.circuit_open_events',
    statistic: 'Maximum',
    threshold: 0,
    comparison: 'GreaterThanThreshold',
    evaluationPeriods: 5,
    periodSeconds: 60,
    description: 'An eSocial endpoint circuit remained open longer than the policy window.',
  },
] as const;

export const ESOCIAL_WAF_BLOCKED_REQUESTS_ALARM = {
  name: 'WafBlockedRequestsAlarm',
  namespace: 'AWS/WAFV2',
  metricName: 'BlockedRequests',
  statistic: 'Sum',
  threshold: 100,
  comparison: 'GreaterThanThreshold',
  evaluationPeriods: 1,
  periodSeconds: 300,
  description: 'WAF blocked requests exceeded 100 in 5 minutes.',
} as const;
