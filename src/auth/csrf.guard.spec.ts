import type { ExecutionContext } from '@nestjs/common';
import { expect, it } from 'vitest';
import { CrossOriginRefusedError } from './auth.errors';
import { CsrfGuard } from './csrf.guard';

function context(method: string, headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  } as unknown as ExecutionContext;
}

const guard = new CsrfGuard(['http://localhost:3040']);

it('lets a GET through without ceremony', () => {
  expect(guard.canActivate(context('GET', {}))).toBe(true);
});

it('lets HEAD and OPTIONS through too', () => {
  expect(guard.canActivate(context('HEAD', {}))).toBe(true);
  expect(guard.canActivate(context('OPTIONS', {}))).toBe(true);
});

it('requires X-Requested-With on a POST', () => {
  expect(() => guard.canActivate(context('POST', { origin: 'http://localhost:3040' }))).toThrow(
    CrossOriginRefusedError,
  );
});

it('rejects a POST with no Origin at all', () => {
  expect(() =>
    guard.canActivate(context('POST', { 'x-requested-with': 'XMLHttpRequest' })),
  ).toThrow(CrossOriginRefusedError);
});

it('rejects a POST from another origin even when it carries the header', () => {
  expect(() =>
    guard.canActivate(
      context('POST', { origin: 'https://evil.example', 'x-requested-with': 'XMLHttpRequest' }),
    ),
  ).toThrow(CrossOriginRefusedError);
});

it('is not fooled by an origin that merely starts with an allowed one', () => {
  expect(() =>
    guard.canActivate(
      context('POST', {
        origin: 'http://localhost:3040.evil.example',
        'x-requested-with': 'XMLHttpRequest',
      }),
    ),
  ).toThrow(CrossOriginRefusedError);
});

it('accepts a same-origin POST carrying both', () => {
  expect(
    guard.canActivate(
      context('POST', { origin: 'http://localhost:3040', 'x-requested-with': 'XMLHttpRequest' }),
    ),
  ).toBe(true);
});

it('applies to DELETE and PATCH, not only POST', () => {
  for (const method of ['DELETE', 'PATCH', 'PUT']) {
    expect(() => guard.canActivate(context(method, {}))).toThrow(CrossOriginRefusedError);
  }
});
