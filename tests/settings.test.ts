import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { newId } from '../src/core/id.js';
import { parseRememberedRelay, rememberRelay } from '../src/device/settings.js';

describe('phone startup', () => {
 it('creates valid random UUIDs without secure-context randomUUID', () => {
  const source = { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) };
  const values = Array.from({length: 100}, () => newId(source));
  expect(new Set(values).size).toBe(100);
  expect(values.every(value => z.uuid().safeParse(value).success)).toBe(true);
 });
 it('restores credentials only for the exact packaged HTTPS origin', () => {
  const origin = 'https://relay.example.com'; const token = 'test-only-00000000000000000000000000';
  const value = rememberRelay(origin, token, origin);
  expect(parseRememberedRelay(value, origin)).toEqual({version:1, origin, token});
  expect(parseRememberedRelay(value, 'https://different.example.com')).toBeNull();
  expect(parseRememberedRelay(value, '')).toBeNull();
  expect(parseRememberedRelay('{ broken', origin)).toBeNull();
  expect(() => rememberRelay('http://relay.example.com', token, 'http://relay.example.com')).toThrow();
  expect(() => rememberRelay(origin, 'short', origin)).toThrow();
 });
});
