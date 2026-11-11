import { sceneGraph } from '@grafana/scenes';
import { DataSourceUidProvider } from '@shared/infrastructure/datasource/DataSourceUidContext';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { ReactNode } from 'react';

import { SceneCreateRecordingRuleModal } from './SceneCreateRecordingRuleModal';

jest.mock('react-inlinesvg', () => {
  const React = require('react');
  return { __esModule: true, default: () => React.createElement('svg', {}) };
});

const mockSave = jest.fn();
jest.mock('./domain/useCreateRecordingRule', () => ({
  useCreateRecordingRule: () => ({ actions: { save: mockSave } }),
}));

jest.mock('@shared/domain/reportInteraction', () => ({
  reportInteraction: jest.fn(),
}));

const mockListLabels = jest.fn();
jest.mock('@shared/infrastructure/labels/labelsRepository', () => ({
  labelsRepository: { listLabels: (options: unknown) => mockListLabels(options) },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <DataSourceUidProvider uid="pyroscope-abc">{children}</DataSourceUidProvider>
);

jest.mock('@grafana/i18n', () => ({
  ...jest.requireActual('@grafana/i18n'),
  t: (_key: string, def: string) => def,
  Trans: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../domain/variables/FiltersVariable/FiltersVariable', () => ({ FiltersVariable: class {} }));
jest.mock('../../domain/variables/ProfileMetricVariable', () => ({ ProfileMetricVariable: class {} }));
jest.mock('../../domain/variables/ServiceNameVariable/ServiceNameVariable', () => ({ ServiceNameVariable: class {} }));
jest.mock('../SceneProfilesExplorer/SceneProfilesExplorer', () => ({
  ExplorationType: { ALL_SERVICES: 'all', FAVORITES: 'favorites' },
  SceneProfilesExplorer: class {},
}));

function findByKeyAndTypeMock(_obj: unknown, key: string) {
  if (key === 'profileMetricId') {
    return { state: { value: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds' } };
  }
  if (key === 'serviceName') {
    return { state: { value: 'pyroscope' }, toString: () => 'pyroscope' };
  }
  if (key === 'filters') {
    return {
      state: {
        filters: [{ key: 'service_repository', operator: '=', value: 'https://github.com/grafana/pyroscope' }],
      },
    };
  }
  if (key === 'profiles-explorer') {
    return { useState: () => ({ explorationType: 'flame-graph' }) };
  }
  return {};
}

describe('SceneCreateRecordingRuleModal', () => {
  beforeEach(() => {
    mockSave.mockReset();
    mockListLabels.mockResolvedValue([{ value: 'service_repository' }]);
    jest.spyOn(sceneGraph, 'findByKeyAndType').mockImplementation(findByKeyAndTypeMock as any);
    jest.spyOn(sceneGraph, 'getTimeRange').mockReturnValue({
      state: { value: { from: { unix: () => 0 }, to: { unix: () => 1 } } },
    } as any);
  });

  test('submits all wizard values to the API (regression: shouldUnregister dropped hidden inputs)', async () => {
    const model = new SceneCreateRecordingRuleModal();

    render(
      <SceneCreateRecordingRuleModal.Component
        model={model}
        isModalOpen={true}
        onDismiss={() => {}}
        onCreated={() => {}}
        functionName="runtime.netpoll"
      />,
      { wrapper }
    );

    fireEvent.input(screen.getByLabelText('Metric name'), { target: { value: 'test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));

    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        metricName: 'profiles_recorded_test',
        serviceName: 'pyroscope',
        profileType: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
        functionName: 'runtime.netpoll',
        matchers: ['{service_repository="https://github.com/grafana/pyroscope"}'],
      })
    );
  });

  test('should load labels from the context datasource', async () => {
    render(
      <SceneCreateRecordingRuleModal.Component
        model={new SceneCreateRecordingRuleModal()}
        isModalOpen={true}
        onDismiss={() => {}}
        onCreated={() => {}}
      />,
      { wrapper }
    );

    await waitFor(() =>
      expect(mockListLabels).toHaveBeenCalledWith(expect.objectContaining({ dataSourceUid: 'pyroscope-abc' }))
    );
  });
});
