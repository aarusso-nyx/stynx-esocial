export type HandlerResult = Readonly<{
  service: string;
  records: number;
  boundary: 'esocial';
}>;

export function handlerResult(service: string, records: number): HandlerResult {
  return {
    service,
    records,
    boundary: 'esocial',
  };
}
