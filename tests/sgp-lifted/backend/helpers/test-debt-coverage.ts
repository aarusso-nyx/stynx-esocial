import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PermissionGuard } from '../../../backend/src/iam/guards/permission.guard';
import { REQUIRED_PERMISSIONS } from '../../../backend/src/iam/decorators/require-permission.decorator';

export const FROZEN_TEST_TIME = new Date('2026-05-02T12:00:00.000Z');

function executionContext() {
  return {
    getHandler: () => Symbol('handler'),
    getClass: () => Symbol('class'),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: 'Bearer wave-7-negative-path' },
      }),
    }),
  } as never;
}

export async function expectForbiddenNegativePath(): Promise<void> {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
    if (key === REQUIRED_PERMISSIONS) return ['rh.write'];
    return undefined;
  });

  const guard = new PermissionGuard(reflector, {
    verifyAuthorizationHeader: jest.fn().mockResolvedValue({
      sub: 'wave-7-reader',
      username: 'wave-7-reader',
      tenantId: '00000000-0000-0000-0000-000000000100',
      groups: ['RH_READONLY'],
      permissions: ['rh.read'],
    }),
  } as never);

  try {
    await guard.canActivate(executionContext());
    throw new Error('Expected PermissionGuard to return 403');
  } catch (error) {
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getStatus()).toBe(403);
  }
}
