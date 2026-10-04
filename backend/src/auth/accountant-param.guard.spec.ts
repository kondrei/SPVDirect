import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { AnafConnectionsController } from '../anaf/controllers/anaf-connections.controller.js';
import { AnafOAuthController } from '../anaf/controllers/anaf-oauth.controller.js';
import { AuthorizationLinksController } from '../anaf/authorization-links/authorization-links.controller.js';
import { CompaniesController } from '../companies/companies.controller.js';
import { AccountantParamGuard } from './accountant-param.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const guard = new AccountantParamGuard();

function context(sessionId: number | undefined, paramId: string | undefined) {
  const req = { accountantId: sessionId, params: { accountantId: paramId } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('AccountantParamGuard', () => {
  it('allows the accountant named in the URL', () => {
    expect(guard.canActivate(context(1, '1'))).toBe(true);
  });

  it('forbids another accountant’s URL', () => {
    expect(() => guard.canActivate(context(1, '2'))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids a route without the accountantId parameter', () => {
    expect(() => guard.canActivate(context(1, undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids a request that has no session accountant', () => {
    expect(() => guard.canActivate(context(undefined, undefined))).toThrow(
      ForbiddenException,
    );
  });
});

describe.each([
  ['CompaniesController', CompaniesController, 'companies'],
  ['AuthorizationLinksController', AuthorizationLinksController, 'companies'],
  ['AnafConnectionsController', AnafConnectionsController, 'anaf/connections'],
])('%s', (_name, controller, rest) => {
  it('is scoped under /accountants/:accountantId', () => {
    expect(Reflect.getMetadata(PATH_METADATA, controller)).toMatch(
      new RegExp(`^accountants/:accountantId/${rest}`),
    );
  });

  it('checks the session before the URL accountant', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
      JwtAuthGuard,
      AccountantParamGuard,
    ]);
  });
});

describe('AnafOAuthController.connect', () => {
  const connect = Object.getOwnPropertyDescriptor(
    AnafOAuthController.prototype,
    'connect',
  )!.value as object;

  it('is scoped under /accountants/:accountantId', () => {
    expect(Reflect.getMetadata(PATH_METADATA, connect)).toBe(
      'accountants/:accountantId/anaf/connect',
    );
  });

  it('checks the session before the URL accountant', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, connect)).toEqual([
      JwtAuthGuard,
      AccountantParamGuard,
    ]);
  });
});
