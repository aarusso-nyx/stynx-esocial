import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { TceMgAdapter } from '../../backend/src/tce/adapters/tce-mg/tce-mg.adapter';
import { StatePayrollDraftPayload } from '../../backend/src/tce/adapters/state-payroll/state-payroll-adapter.base';

const goldenDir = join(__dirname, 'golden', 'tce', 'state-payroll-v01');
const updateGoldens = process.env.SGP_UPDATE_R3_016_GOLDENS === '1';

describe('R3-016 TCE golden fixture (e2e)', () => {
  it('serializes a source-pending state payroll adapter fixture byte-for-byte', () => {
    const adapter = new TceMgAdapter();
    const payload = readJson<StatePayrollDraftPayload>(
      join(goldenDir, 'input.json'),
    );

    expect(adapter.validate(payload, '0.0.1')).toMatchObject({
      status: 'OK',
      errors: [],
    });

    const envelope = adapter.serialize(payload, '0.0.1');
    const expected = expectedText(
      join(goldenDir, 'expected.json'),
      envelope.body,
    );

    expect(envelope).toMatchObject({
      layoutCode: 'TCE-MG-FOLHA-SOURCE-PENDING',
      layoutVersion: '0.0.1',
      contentType: 'application/json',
      payloadHash: createHash('sha256').update(envelope.body).digest('hex'),
    });
    expect(envelope.body).toBe(expected);
    expect(JSON.parse(envelope.body)).toMatchObject({
      sourceStatus: 'UNVERIFIED_LAYOUT',
      officialConformance: false,
    });
  });
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function expectedText(path: string, actual: string): string {
  if (updateGoldens || !existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, actual, 'utf8');
  }
  return readFileSync(path, 'utf8').replace(/\n$/, '');
}
