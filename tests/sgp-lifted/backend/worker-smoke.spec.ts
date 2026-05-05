import { Logger } from 'nestjs-pino';

type FakeApp = {
  close: jest.Mock<Promise<void>, []>;
  enableCors: jest.Mock<void, [unknown]>;
  get: jest.Mock;
  getHttpAdapter: jest.Mock;
  listen: jest.Mock<Promise<void>, [unknown?]>;
  setGlobalPrefix: jest.Mock<void, [string]>;
  use: jest.Mock<void, [unknown]>;
  useLogger: jest.Mock<void, [unknown]>;
};

const pollOnce = jest.fn(async () => ({
  discovered: 0,
  processed: 0,
  failed: 0,
  skipped: 0,
}));
const backpressureStatus = jest.fn(async () => ({
  activeClaims: 0,
  capacity: 1,
  limit: 1,
  queueDepth: 0,
  skipped: false,
}));
const schedulerRunOnce = jest.fn(async () => {
  const backpressure = await backpressureStatus();
  if (!backpressure.skipped) {
    await pollOnce(backpressure.limit);
  }
});
const schedulerStart = jest.fn(async () => undefined);
const schedulerStop = jest.fn();
const create = jest.fn(async () => fakeApp());
const createApplicationContext = jest.fn(async () => fakeApp());

jest.mock('@nestjs/core', () => ({
  NestFactory: { create, createApplicationContext },
}));

jest.mock('@nestjs/swagger', () => ({
  ...jest.requireActual('@nestjs/swagger'),
  DocumentBuilder: jest.fn().mockImplementation(() => ({
    setTitle: jest.fn().mockReturnThis(),
    setDescription: jest.fn().mockReturnThis(),
    setVersion: jest.fn().mockReturnThis(),
    addBearerAuth: jest.fn().mockReturnThis(),
    build: jest.fn(() => ({})),
  })),
  SwaggerModule: {
    createDocument: jest.fn(() => ({})),
    setup: jest.fn(),
  },
}));

describe('backend entrypoint smoke coverage', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    pollOnce.mockClear();
    backpressureStatus.mockClear();
    schedulerRunOnce.mockClear();
    schedulerStart.mockClear();
    schedulerStop.mockClear();
    process.env.NODE_ENV = 'test';
    process.env.ESOCIAL_WORKER_ONESHOT = 'true';
    process.env.INTEGRATIONS_WORKER_ONESHOT = 'true';
    process.env.REPORT_WORKER_ONESHOT = 'true';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it.each([
    ['core api', () => import('../../backend/src/main')],
    ['portal api', () => import('../../backend/src/main-portal')],
    ['payroll engine', () => import('../../backend/src/main-payroll-engine')],
    ['report service', () => import('../../backend/src/main-report-service')],
  ])('boots the %s HTTP entrypoint', async (_name, load) => {
    const entrypoint = await load();

    await entrypoint.bootstrap();

    expect(create).toHaveBeenCalled();
    expect(lastCreatedApp().listen).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['eSocial worker', () => import('../../backend/src/main-esocial-worker')],
    [
      'integrations worker',
      () => import('../../backend/src/main-integrations-worker'),
    ],
    ['report worker', () => import('../../backend/src/main-report-worker')],
  ])('boots the %s entrypoint in one-shot mode', async (_name, load) => {
    const entrypoint = await load();

    await entrypoint.bootstrap();

    expect(createApplicationContext).toHaveBeenCalled();
    expect(pollOnce).toHaveBeenCalledTimes(1);
    expect(lastCreatedApp().close).toHaveBeenCalledTimes(1);
  });
});

function fakeApp(): FakeApp {
  const app: FakeApp = {
    close: jest.fn(async () => undefined),
    enableCors: jest.fn(),
    get: jest.fn((token: unknown) => {
      if (token === Logger) return { logger: 'pino' };
      if (providerName(token) === 'WorkerPollSchedulerService') {
        return fakeScheduler();
      }
      return { backpressureStatus, pollOnce };
    }),
    getHttpAdapter: jest.fn(() => ({
      getInstance: () => ({ get: jest.fn(), set: jest.fn() }),
    })),
    listen: jest.fn(async () => undefined),
    setGlobalPrefix: jest.fn(),
    use: jest.fn(),
    useLogger: jest.fn(),
  };
  createdApps.push(app);
  return app;
}

const createdApps: FakeApp[] = [];

function lastCreatedApp(): FakeApp {
  return createdApps[createdApps.length - 1]!;
}

function fakeScheduler() {
  return {
    get oneshot() {
      return true;
    },
    runOnce: schedulerRunOnce,
    start: schedulerStart,
    stop: schedulerStop,
  };
}

function providerName(token: unknown): string | undefined {
  return typeof token === 'function' ? token.name : undefined;
}
