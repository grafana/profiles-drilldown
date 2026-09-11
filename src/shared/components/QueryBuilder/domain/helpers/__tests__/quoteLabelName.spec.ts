import { quoteLabelName, quoteLabelValue } from '../quoteLabelName';

type TestCase = [string, string];

const cases: TestCase[] = [
  // safe names - unchanged
  ['action', 'action'],
  ['span_name', 'span_name'],
  ['_private', '_private'],
  ['service_name', 'service_name'],
  ['camelCase', 'camelCase'],
  ['with123numbers', 'with123numbers'],
  // unsafe names - quoted
  ['http.method', '"http.method"'],
  ['k8s.node.name', '"k8s.node.name"'],
  ['my-label', '"my-label"'],
  ['0invalid', '"0invalid"'],
  ['has space', '"has space"'],
  ['label"with"quotes', '"label\\"with\\"quotes"'],
  ['back\\slash', '"back\\\\slash"'],
  ['mix\\"both', '"mix\\\\\\"both"'],
];

describe('quoteLabelName(name: string)', () => {
  test.each<TestCase>(cases)("given '%s', returns '%s'", (name, expected) => {
    expect(quoteLabelName(name)).toBe(expected);
  });
});

describe('quoteLabelValue', () => {
  it('escapes quotes and backslashes', () => {
    expect(quoteLabelValue('api"blue\\canary')).toBe('"api\\"blue\\\\canary"');
  });
});
