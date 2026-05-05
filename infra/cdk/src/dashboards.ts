export type EsocialDashboardWidget = Readonly<{
  title: string;
  metricNames: readonly string[];
  statistic: 'Sum' | 'Average' | 'p99' | 'Maximum';
}>;

export type EsocialDashboardDeclaration = Readonly<{
  name: 'EsocialOperationsDashboard';
  widgets: readonly EsocialDashboardWidget[];
}>;

export const ESOCIAL_DASHBOARD_REGISTRY: EsocialDashboardDeclaration = {
  name: 'EsocialOperationsDashboard',
  widgets: [
    {
      title: 'Throughput',
      metricNames: ['esocial.accepted', 'esocial.rejected', 'esocial.validation_failed'],
      statistic: 'Sum',
    },
    {
      title: 'DLQ depth',
      metricNames: ['esocial.dlq'],
      statistic: 'Sum',
    },
    {
      title: 'Rejected rate',
      metricNames: ['esocial.rejected'],
      statistic: 'Sum',
    },
    {
      title: 'p99 SOAP latency',
      metricNames: ['esocial.soap_latency_ms'],
      statistic: 'p99',
    },
    {
      title: 'Circuit state per endpoint',
      metricNames: ['esocial.circuit_open_events'],
      statistic: 'Maximum',
    },
  ],
};
