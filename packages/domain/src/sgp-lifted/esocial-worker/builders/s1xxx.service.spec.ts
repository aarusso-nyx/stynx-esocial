import { S1xxxService } from './s1xxx.service';
import type {
  S1xxxBuilder,
  S1xxxDispatchResult,
  S1xxxEventKind,
} from './s1xxx-common';

function builder(eventKind: S1xxxEventKind): S1xxxBuilder {
  return {
    eventKind,
    build: jest.fn(),
  };
}

describe('S1xxxService', () => {
  const result = (eventKind: S1xxxEventKind): S1xxxDispatchResult => ({
    eventKind,
    sourceEntityId: `${eventKind}-source`,
    sourceEntityKind: 'fixture',
    xmlHash: `${eventKind}-hash`,
    emitted: true,
  });

  function service() {
    const dispatchService = {
      status: jest.fn().mockResolvedValue([{ eventKind: 'S-1000' }]),
      dispatch: jest.fn(async (inputBuilder: S1xxxBuilder) => [
        result(inputBuilder.eventKind),
      ]),
    };
    const builders = [
      builder('S-1000'),
      builder('S-1005'),
      builder('S-1010'),
      builder('S-1020'),
      builder('S-1030'),
      builder('S-1040'),
      builder('S-1060'),
      builder('S-1050'),
      builder('S-1070'),
    ] as const;

    return {
      dispatchService,
      builders,
      service: new S1xxxService(dispatchService as never, ...builders),
    };
  }

  it('proxies status to the dispatch service', async () => {
    const subject = service();

    await expect(subject.service.status()).resolves.toEqual([
      { eventKind: 'S-1000' },
    ]);
  });

  it('dispatches every configured S-1xxx builder', async () => {
    const subject = service();

    await expect(
      subject.service.emitAll({ competence: '2026-05', force: true }),
    ).resolves.toHaveLength(9);

    expect(subject.dispatchService.dispatch).toHaveBeenCalledTimes(9);
    expect(subject.dispatchService.dispatch).toHaveBeenCalledWith(
      subject.builders[0],
      { competence: '2026-05', force: true },
    );
  });

  it('skips missing builders during bulk dispatch', async () => {
    const subject = service();
    (
      subject.service as unknown as { builders: Record<string, S1xxxBuilder> }
    ).builders['S-1005'] = undefined as never;

    await expect(subject.service.emitAll({})).resolves.toHaveLength(8);
    expect(subject.dispatchService.dispatch).toHaveBeenCalledTimes(8);
  });

  it('dispatches one supported S-1xxx event kind', async () => {
    const subject = service();

    await expect(
      subject.service.emitOne('S-1040', { competence: '2026-05' }),
    ).resolves.toEqual([result('S-1040')]);

    expect(subject.dispatchService.dispatch).toHaveBeenCalledWith(
      subject.builders[5],
      { competence: '2026-05' },
    );
  });

  it('rejects unsupported S-1xxx event kinds', () => {
    const subject = service();

    expect(() =>
      subject.service.emitOne('S-9999' as S1xxxEventKind, {}),
    ).toThrow('Unsupported S-1xxx event kind: S-9999');
  });
});
