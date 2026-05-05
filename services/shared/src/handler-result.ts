export type HandlerResult = Readonly<{
  service: string;
  records: number;
  boundary: 'stynx-esocial';
}>;

export function handlerResult(service: string, records: number): HandlerResult {
  return {
    service,
    records,
    boundary: 'stynx-esocial',
  };
}
