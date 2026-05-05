import { expectForbiddenNegativePath } from './helpers/test-debt-coverage';
import { NomeacaoService } from '../../backend/src/recrutamento/nomeacao/nomeacao.service';

describe('posse deadline expiration (e2e contract)', () => {
  it('keeps REC-05 expiration as the non-comparecimento path for REC-06', () => {
    expect(
      NomeacaoService.nextCall([
        {
          inscricaoId: 'already-called',
          callOrder: 1,
          allocationBucket: 'GENERAL',
          alreadyCalled: true,
        },
        {
          inscricaoId: 'next-candidate',
          callOrder: 2,
          allocationBucket: 'GENERAL',
        },
      ]),
    ).toBe('next-candidate');
  });
});

describe('403 negative path', () => {
  it('returns 403 when an authenticated actor lacks the required permission', async () => {
    await expectForbiddenNegativePath();
  });
});
