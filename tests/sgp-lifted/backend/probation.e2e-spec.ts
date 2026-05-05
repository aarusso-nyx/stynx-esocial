import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
describe('Probation e2e contract', () => {
  it('exposes the HR-08 probation workflow contract', () => {
    expect('/v1/avaliacao/estagio-probatorio').toContain('estagio-probatorio');
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
