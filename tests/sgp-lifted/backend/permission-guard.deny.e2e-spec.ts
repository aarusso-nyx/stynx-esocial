import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PermissionGuard } from '../../backend/src/iam/guards/permission.guard';

function executionContext(authorization?: string) {
  return {
    getHandler: () => Symbol('handler'),
    getClass: () => Symbol('class'),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization ? { authorization } : {},
      }),
    }),
  } as never;
}

describe('PermissionGuard deny behavior', () => {
  it('returns 403 when a route has no @RequirePermission or @Public metadata', async () => {
    const guard = new PermissionGuard(
      { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as never,
      { verifyAuthorizationHeader: jest.fn() } as never,
    );

    await expect(
      guard.canActivate(executionContext('Bearer token')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 401 when a protected route receives no token', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'requiredPermissions') return ['gestao.read'];
      return undefined;
    });
    const guard = new PermissionGuard(reflector, {
      verifyAuthorizationHeader: jest
        .fn()
        .mockRejectedValue(new UnauthorizedException('Missing bearer token')),
    } as never);

    await expect(guard.canActivate(executionContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns 403 when the token has the wrong permission', async () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'requiredPermissions') return ['gestao.write'];
      return undefined;
    });
    const guard = new PermissionGuard(reflector, {
      verifyAuthorizationHeader: jest.fn().mockResolvedValue({
        sub: 'user-1',
        username: 'user-1',
        tenantId: '00000000-0000-0000-0000-000000000100',
        groups: ['RH'],
        permissions: ['gestao.read'],
      }),
    } as never);

    await expect(
      guard.canActivate(executionContext('Bearer token')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
