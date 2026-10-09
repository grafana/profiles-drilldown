import { dateTimeParse } from '@grafana/data';
import { sceneGraph, TestVariable } from '@grafana/scenes';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { copyGcxCommandToClipboard } from '../../../../../domain/copyGcxCommandToClipboard';
import { SceneExportMenu } from '../SceneExportMenu';

jest.mock('compression-streams-polyfill', () => ({}));
jest.mock('../../../infrastructure/PprofApiClient', () => ({ PprofApiClient: jest.fn() }));
jest.mock('../../../../../domain/copyGcxCommandToClipboard');
jest.mock('@shared/domain/url-params/useMaxNodesFromUrl', () => ({ useMaxNodesFromUrl: () => [5000] }));
jest.mock('@shared/infrastructure/settings/useFetchPluginSettings', () => ({
  useFetchPluginSettings: () => ({ settings: {} }),
}));
jest.mock('@shared/domain/useIsFlameGraphCanvasPresent', () => ({ useIsFlameGraphCanvasPresent: () => false }));

describe('SceneExportMenu', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    { profileIdSelector: 'profile-123', spanSelector: 'span-456' },
    { profileIdSelector: undefined, spanSelector: undefined },
  ])('copies a command preserving selectors: %s', async (selectors) => {
    jest.mocked(copyGcxCommandToClipboard).mockClear();
    jest
      .spyOn(sceneGraph, 'findByKeyAndType')
      .mockReturnValue(new TestVariable({ name: 'dataSource', value: 'pyroscope' }));
    const model = new SceneExportMenu();

    render(
      <SceneExportMenu.Component
        model={model}
        query={'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="api"}'}
        timeRange={{
          raw: { from: '1', to: '2' },
          from: dateTimeParse(1000),
          to: dateTimeParse(2000),
        }}
        {...selectors}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export profile data' }));
    fireEvent.click(await screen.findByText('gcx command'));

    await waitFor(() => expect(copyGcxCommandToClipboard).toHaveBeenCalledTimes(1));
    const command = jest.mocked(copyGcxCommandToClipboard).mock.calls[0][0];
    expect(command.includes("--profile-id 'profile-123'")).toBe(Boolean(selectors.profileIdSelector));
    expect(command.includes("--span-id 'span-456'")).toBe(Boolean(selectors.spanSelector));
  });
});
