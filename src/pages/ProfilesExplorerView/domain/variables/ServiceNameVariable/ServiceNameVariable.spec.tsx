import { MultiValueVariable, MultiValueVariableState } from '@grafana/scenes';
import { userStorage } from '@shared/infrastructure/userStorage';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { ServiceNameVariable } from './ServiceNameVariable';

jest.mock('@shared/infrastructure/userStorage', () => ({
  userStorage: {
    KEYS: { PROFILES_EXPLORER: 'profilesExplorer.test' },
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('@grafana/ui', () => {
  const React = require('react');
  const actual = jest.requireActual('@grafana/ui');
  return {
    ...actual,
    Icon: ({ name, ...props }: { name: string }) => <span data-testid={`icon-${name}`} {...props} />,
    Cascader: () => React.createElement('div', { 'data-testid': 'service-cascader' }),
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

type InterceptFn = (stateUpdate: Partial<MultiValueVariableState>) => void;

function callIntercept(model: ServiceNameVariable, stateUpdate: Partial<MultiValueVariableState>) {
  (model as unknown as { interceptStateUpdateAfterValidation: InterceptFn }).interceptStateUpdateAfterValidation(
    stateUpdate
  );
}

type ServiceNameComponentModel = MultiValueVariable & { selectNewValue?: (v: string) => void };

describe('ServiceNameVariable', () => {
  beforeEach(() => {
    jest.mocked(userStorage.get).mockReturnValue(null);
  });

  describe('setInitialValue', () => {
    it('sets value from initialFilters service_name when present', () => {
      const model = new ServiceNameVariable({
        initialFilters: [{ key: 'service_name', operator: '=', value: 'embedded-svc' }],
      });

      model.setInitialValue();

      expect(model.state.value).toBe('embedded-svc');
    });

    it('uses initialFilters service_name over userStorage when both exist', () => {
      jest.mocked(userStorage.get).mockReturnValue({
        serviceName: 'from-storage',
      });

      const model = new ServiceNameVariable({
        initialFilters: [{ key: 'service_name', operator: '=', value: 'from-embed' }],
      });

      model.setInitialValue();

      expect(model.state.value).toBe('from-embed');
    });

    it('restores serviceName from userStorage when there is no value and no initial service_name filter', () => {
      jest.mocked(userStorage.get).mockReturnValue({
        serviceName: 'stored-svc',
      });

      const model = new ServiceNameVariable();
      model.setState({ value: '' });

      model.setInitialValue();

      expect(model.state.value).toBe('stored-svc');
    });

    it.each(['=~', '!=', '!~'])('does not restore a stale service with an initial %s constraint', (operator) => {
      jest.mocked(userStorage.get).mockReturnValue({
        serviceName: 'worker',
      });

      const model = new ServiceNameVariable({
        initialFilters: [{ key: 'service_name', operator, value: 'api-.*' }],
      });
      model.setState({ value: '' });

      model.setInitialValue();

      expect(model.state.value).toBe('');
    });

    it('restores from storage when initial filters only constrain other labels', () => {
      jest.mocked(userStorage.get).mockReturnValue({ serviceName: 'stored-svc' });
      const model = new ServiceNameVariable({
        initialFilters: [{ key: 'region', operator: '=', value: 'eu' }],
      });
      model.setState({ value: '' });

      model.setInitialValue();

      expect(model.state.value).toBe('stored-svc');
    });
  });

  describe('interceptStateUpdateAfterValidation', () => {
    it('keeps previous value and text when the catalog no longer lists that service', () => {
      const model = new ServiceNameVariable();
      model.setState({
        value: 'missing-svc',
        text: 'Missing label',
        options: [],
      });

      const stateUpdate: Partial<MultiValueVariableState> = {
        options: [{ value: 'only-listed', label: 'Only listed' }],
      };

      callIntercept(model, stateUpdate);

      expect(stateUpdate.value).toBe('missing-svc');
      expect(stateUpdate.text).toBe('Missing label');
      expect((stateUpdate as { serviceCatalogFetched?: boolean }).serviceCatalogFetched).toBe(true);
    });

    it('does not override when the current value is still in the new options', () => {
      const model = new ServiceNameVariable();
      model.setState({
        value: 'keep-me',
        text: 'Keep me',
        options: [],
      });

      const stateUpdate: Partial<MultiValueVariableState> = {
        value: 'keep-me',
        text: 'Keep me',
        options: [
          { value: 'keep-me', label: 'Keep me' },
          { value: 'other', label: 'Other' },
        ],
      };

      callIntercept(model, stateUpdate);

      expect(stateUpdate.value).toBe('keep-me');
      expect(stateUpdate.text).toBe('Keep me');
    });
  });

  describe('Component (unmatched service warning)', () => {
    it('shows a warning icon when the selected service is not in the loaded options', () => {
      const model = {
        useState: () =>
          ({
            loading: false,
            value: 'not-in-catalog',
            options: [{ value: 'listed', label: 'Listed' }],
            error: null,
            serviceCatalogFetched: true,
          } as MultiValueVariableState & { serviceCatalogFetched?: boolean }),
        selectNewValue: jest.fn(),
      };

      render(<ServiceNameVariable.Component model={model as unknown as ServiceNameComponentModel} />);

      expect(screen.getByTestId('icon-exclamation-triangle')).toBeInTheDocument();
      expect(screen.getByTestId('service-cascader')).toBeInTheDocument();
    });

    it('does not show the warning icon while options are still loading', () => {
      const model = {
        useState: () =>
          ({
            loading: true,
            value: 'not-in-catalog',
            options: [{ value: 'listed', label: 'Listed' }],
            error: null,
            serviceCatalogFetched: true,
          } as MultiValueVariableState & { serviceCatalogFetched?: boolean }),
        selectNewValue: jest.fn(),
      };

      render(<ServiceNameVariable.Component model={model as unknown as ServiceNameComponentModel} />);

      expect(screen.queryByTestId('icon-exclamation-triangle')).not.toBeInTheDocument();
    });
  });
});
