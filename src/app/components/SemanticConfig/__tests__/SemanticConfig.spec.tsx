import { isJevAdmin, loadJevConfiguration, saveJevConfiguration } from '@shared/infrastructure/semantic/jevProxy';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

import { SemanticConfig } from '../SemanticConfig';

jest.mock('@shared/infrastructure/semantic/jevProxy');

const KEY_LABEL = 'OpenRouter API key';
const ENABLE_LABEL = 'Enable function classification';

beforeEach(() => {
  jest.mocked(isJevAdmin).mockReturnValue(true);
  jest
    .mocked(loadJevConfiguration)
    .mockResolvedValue({ enabled: false, keyConfigured: true, confidenceThreshold: 0.8 });
  jest.mocked(saveJevConfiguration).mockResolvedValue(undefined);
});

test('explains the OpenRouter credential and model requirements', async () => {
  render(<SemanticConfig />);
  expect(await screen.findByLabelText(KEY_LABEL)).toHaveValue('');
  expect(screen.getByText(/typesafe\/jev-1\.13/)).toHaveTextContent('OpenRouter');
  expect(screen.getByLabelText(ENABLE_LABEL)).not.toBeChecked();
});

test('keeps the privacy disclosure without the prototype banner or setup caveats', async () => {
  render(<SemanticConfig />);
  await screen.findByLabelText(KEY_LABEL);
  expect(screen.queryByText('Experimental: local development only')).not.toBeInTheDocument();
  expect(screen.queryByText(/No separate Jev activation/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Applies when you return/)).not.toBeInTheDocument();
  expect(screen.getByText(/Function Classification sends/)).toHaveTextContent("client's IP address");
  expect(screen.getByText(/Lower values accept/)).toHaveTextContent(
    'Lower values accept more suggestions, not more accurate predictions.'
  );
});

test('shows a configured key without putting a secret in the input', async () => {
  render(<SemanticConfig />);
  expect(await screen.findByLabelText(KEY_LABEL)).toHaveValue('');
  expect(screen.getByLabelText(KEY_LABEL)).toHaveAttribute('placeholder', 'Configured');
  expect(screen.getByLabelText(ENABLE_LABEL)).not.toBeChecked();
});

test('loads the saved confidence threshold', async () => {
  jest
    .mocked(loadJevConfiguration)
    .mockResolvedValue({ enabled: false, keyConfigured: true, confidenceThreshold: 0.6 });
  render(<SemanticConfig />);
  expect(await screen.findByRole('spinbutton', { name: 'Confidence threshold' })).toHaveValue(0.6);
});

test.each(['0', '1', '0.4', '0.801'])('saves threshold %s without changing opt-in or the key', async (value) => {
  render(<SemanticConfig />);
  const threshold = await screen.findByRole('spinbutton', { name: 'Confidence threshold' });
  expect(threshold).toHaveValue(0.8);
  fireEvent.change(threshold, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveJevConfiguration).toHaveBeenCalledWith(false, '', Number(value)));
});

test.each(['', 'abc', '-0.1', '1.1', '1e309'])('blocks invalid threshold %j', async (value) => {
  render(<SemanticConfig />);
  const threshold = await screen.findByRole('spinbutton', { name: 'Confidence threshold' });
  fireEvent.change(threshold, { target: { value } });
  expect(screen.getByText('Enter a number from 0 to 1.')).toBeInTheDocument();
  expect(threshold).toHaveAccessibleDescription(expect.stringContaining('Enter a number from 0 to 1.'));
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.submit(threshold.closest('form')!);
  expect(saveJevConfiguration).not.toHaveBeenCalled();
});

test('does not mount the configuration form for a non-admin', async () => {
  jest.mocked(isJevAdmin).mockReturnValue(false);
  render(<SemanticConfig />);
  expect(
    await screen.findByText('Classification configuration requires a Grafana organization admin.')
  ).toBeInTheDocument();
  expect(loadJevConfiguration).not.toHaveBeenCalled();
});

test('saves the opt-in and clears the entered key after success', async () => {
  render(<SemanticConfig />);
  const key = await screen.findByLabelText(KEY_LABEL);
  fireEvent.click(screen.getByLabelText(ENABLE_LABEL));
  fireEvent.change(key, { target: { value: 'synthetic-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveJevConfiguration).toHaveBeenCalledWith(true, 'synthetic-secret', 0.8));
  await waitFor(() => expect(key).toHaveValue(''));
  expect(screen.getByText('Configuration saved.')).toBeInTheDocument();
});

test('cannot enable classification without a configured or entered key', async () => {
  jest
    .mocked(loadJevConfiguration)
    .mockResolvedValue({ enabled: false, keyConfigured: false, confidenceThreshold: 0.8 });
  render(<SemanticConfig />);
  await screen.findByLabelText(KEY_LABEL);
  fireEvent.click(screen.getByLabelText(ENABLE_LABEL));
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('locks the submitted values while saving', async () => {
  let finish!: () => void;
  jest.mocked(saveJevConfiguration).mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    })
  );
  render(<SemanticConfig />);
  const key = await screen.findByLabelText(KEY_LABEL);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(key).toBeDisabled();
  expect(screen.getByRole('spinbutton', { name: 'Confidence threshold' })).toBeDisabled();
  expect(screen.getByLabelText(ENABLE_LABEL)).toBeDisabled();
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled());
});
