import { normalizeInternalPathname } from '../normalizeInternalPathname';

describe('normalizeInternalPathname(pathname)', () => {
  it.each([
    ['//evil.example/path', '/evil.example/path'],
    ['\\\\evil.example\\path', '/evil.example/path'],
    ['///evil.example/path', '/evil.example/path'],
    ['/a/grafana-pyroscope-app/settings', '/a/grafana-pyroscope-app/settings'],
    ['a/grafana-pyroscope-app/settings', '/a/grafana-pyroscope-app/settings'],
  ])('returns an internal path with one leading slash (%s)', (pathname, expected) => {
    expect(normalizeInternalPathname(pathname)).toBe(expected);
  });
});
