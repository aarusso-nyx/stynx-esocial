import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';

import { startWorkerReadinessProbe } from './common/bootstrap/worker-readiness-probe';
import { usePinoLogger } from './common/logging/bootstrap-logger';
import { createLoggingModule } from './common/logging/logging.config';
import {
  createWorkerPollSchedulerProviders,
  registerWorkerShutdown,
  WorkerPollSchedulerService,
} from './common/worker-scheduling/worker-poll-scheduler.service';
import { ESocialWorkerModule } from './esocial-worker/esocial-worker.module';
import { ESocialWorkerService } from './esocial-worker/esocial-worker.service';

@Module({
  imports: [
    createLoggingModule('sgp-esocial-worker'),
    ScheduleModule.forRoot(),
    ESocialWorkerModule,
  ],
  providers: createWorkerPollSchedulerProviders(ESocialWorkerService, {
    workerName: 'sgp-esocial-worker',
    pollIntervalEnv: 'ESOCIAL_WORKER_POLL_MS',
    pollLimitEnv: 'ESOCIAL_WORKER_POLL_LIMIT',
    oneshotEnv: 'ESOCIAL_WORKER_ONESHOT',
  }),
})
class ESocialWorkerRuntimeModule {}

export async function bootstrap() {
  const app = await NestFactory.createApplicationContext(
    ESocialWorkerRuntimeModule,
    { bufferLogs: true },
  );
  usePinoLogger(app);
  const scheduler = app.get(WorkerPollSchedulerService);
  const readiness = await startWorkerReadinessProbe({
    workerName: 'sgp-esocial-worker',
    portEnv: 'ESOCIAL_WORKER_READY_PORT',
    defaultPort: 3303,
  });

  if (scheduler.oneshot) {
    await scheduler.runOnce();
    await readiness.close();
    await app.close();
    return;
  }

  await scheduler.start();
  registerWorkerShutdown(app, scheduler, () => readiness.close());
}

if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}
