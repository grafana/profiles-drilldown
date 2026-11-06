import { initialServiceNames } from './initialServiceNames';

describe('initialServiceNames', () => {
  it('handles missing service filters', () => {
    expect(initialServiceNames([])).toEqual([]);
    expect(initialServiceNames([{ key: 'region', operator: '=', value: 'eu' }])).toEqual([]);
  });

  it.each([
    ['=', 'api', ['api']],
    ['!=', 'api', []],
    ['!~', 'api|worker', []],
    ['=~', 'api|worker', ['api', 'worker']],
    ['=~', 'api\\.prod|worker', ['api.prod', 'worker']],
    ['=~', 'api\\|worker', ['api|worker']],
    ['=~', 'api-.*', []],
    ['=~', '(api|worker)', []],
    ['=~', '\\w+', []],
    ['=~', 'api|', []],
    ['=~', '', []],
  ])('decodes %s %s safely', (operator, value, expected) => {
    expect(initialServiceNames([{ key: 'service_name', operator, value }])).toEqual(expected);
  });
});
