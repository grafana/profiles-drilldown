import type { initPluginTranslations } from '@grafana/i18n';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { SemanticConfigPage } from '../SemanticConfigPage';

const mockInitialize = jest.fn<ReturnType<typeof initPluginTranslations>, Parameters<typeof initPluginTranslations>>();
jest.mock('@grafana/i18n', () => ({
  initPluginTranslations: (...args: Parameters<typeof initPluginTranslations>) => mockInitialize(...args),
}));
jest.mock('../../../../i18n/loadResources', () => ({ loadResources: jest.fn() }));
jest.mock('../SemanticConfig', () => ({ SemanticConfig: () => <div>Configuration ready</div> }));

test('initializes the plugin namespace before rendering a directly opened config page', async () => {
  let resolve!: (value: { language: string }) => void;
  mockInitialize.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  render(<SemanticConfigPage />);
  await waitFor(() => expect(mockInitialize).toHaveBeenCalledWith('grafana-pyroscope-app', [expect.any(Function)]));
  expect(screen.queryByText('Configuration ready')).not.toBeInTheDocument();
  await act(async () => resolve({ language: 'en-US' }));
  expect(await screen.findByText('Configuration ready')).toBeInTheDocument();
});
