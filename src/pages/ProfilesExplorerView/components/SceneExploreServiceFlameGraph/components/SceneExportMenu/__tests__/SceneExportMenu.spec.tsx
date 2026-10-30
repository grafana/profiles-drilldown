import { dateTimeParse } from '@grafana/data';
import { DataSourceUidProvider } from '@shared/infrastructure/datasource/DataSourceUidContext';
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

type Selectors = { profileIdSelector?: string; spanSelector?: string };

function renderExportMenu(selectors: Selectors) {
  render(
    <DataSourceUidProvider uid="pyroscope-abc">
      <SceneExportMenu.Component
        model={new SceneExportMenu()}
        query={'process_cpu:cpu:nanoseconds:cpu:nanoseconds{service_name="api"}'}
        timeRange={{ raw: { from: '1', to: '2' }, from: dateTimeParse(1000), to: dateTimeParse(2000) }}
        {...selectors}
      />
    </DataSourceUidProvider>
  );
}

async function copyGcxCommand() {
  fireEvent.click(screen.getByRole('button', { name: 'Export profile data' }));
  fireEvent.click(await screen.findByText('gcx command'));

  await waitFor(() => expect(copyGcxCommandToClipboard).toHaveBeenCalledTimes(1));
}

describe('SceneExportMenu', () => {
  it.each([
    { profileIdSelector: 'profile-123', spanSelector: 'span-456' },
    { profileIdSelector: undefined, spanSelector: undefined },
  ])('copies a command preserving selectors: %s', async (selectors) => {
    renderExportMenu(selectors);

    await copyGcxCommand();

    expect(jest.mocked(copyGcxCommandToClipboard).mock.calls[0][0].includes("--profile-id 'profile-123'")).toBe(
      Boolean(selectors.profileIdSelector)
    );
    expect(jest.mocked(copyGcxCommandToClipboard).mock.calls[0][0].includes("--span-id 'span-456'")).toBe(
      Boolean(selectors.spanSelector)
    );
  });

  it('should copy a gcx command for the context datasource', async () => {
    renderExportMenu({});

    await copyGcxCommand();

    expect(jest.mocked(copyGcxCommandToClipboard).mock.calls[0][0]).toContain("-d 'pyroscope-abc'");
  });
});
