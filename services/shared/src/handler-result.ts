import {
  createPinoLogger,
} from '@esocial/domain';

export type HandlerResult = Readonly<{
  service: string;
  records: number;
  boundary: 'esocial';
}>;

export function handlerResult(service: string, records: number): HandlerResult {
  const logger = createPinoLogger({ service });
  logger.info({
    stage: 'ingress',
    message: 'Handler invoked.',
    context: { attempt: 0 },
    data: { records },
  });
  logger.info({
    stage: 'publish',
    message: 'Handler completed.',
    context: { attempt: 0 },
    data: { records },
  });

  return {
    service,
    records,
    boundary: 'esocial',
  };
}
