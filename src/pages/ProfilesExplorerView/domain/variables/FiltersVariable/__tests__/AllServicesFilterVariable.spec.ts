import { AllServicesFilterVariable } from '../AllServicesFilterVariable';

jest.mock('../../../../components/SceneProfilesExplorer/SceneProfilesExplorer', () => ({
  SceneProfilesExplorer: jest.fn(),
}));

describe('AllServicesFilterVariable', () => {
  it('should only offer operators supported by Pyroscope', () => {
    const variable = new AllServicesFilterVariable({ key: 'filtersAllServices' });

    expect(variable._getOperators().map((operator) => operator.value)).toEqual(['=', '!=', '=~', '!~']);
  });

  it('should keep building the Pyroscope expression for legacy filter objects', () => {
    const variable = new AllServicesFilterVariable({
      key: 'filtersAllServices',
      initialFilters: [
        { key: 'region', operator: '=~', value: 'eu-north|us-east' },
        { key: 'cluster', operator: 'is-empty', value: '' },
      ],
    });

    expect(variable.state.filterExpression).toBe('region=~"eu-north|us-east",cluster=""');
  });

  it('should keep the leading comma expression', () => {
    const variable = new AllServicesFilterVariable({
      key: 'filtersAllServices',
      initialFilters: [{ key: 'region', operator: '=~', value: 'eu-north|us-east' }],
    });

    expect(variable.getValue('filterExpressionWithLeadingComma')).toBe(',region=~"eu-north|us-east"');
  });
});
