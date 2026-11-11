import { displayError, displaySuccess } from '@shared/domain/displayStatus';
import { reportInteraction } from '@shared/domain/reportInteraction';

import { copyGcxCommandToClipboard } from '../copyGcxCommandToClipboard';

jest.mock('@shared/domain/displayStatus');
jest.mock('@shared/domain/reportInteraction');

describe('copyGcxCommandToClipboard', () => {
  const writeText = jest.fn();
  const messages = { success: 'Copied!', error: 'Copy failed!' };
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  });

  afterAll(() => {
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it.each(['command', 'baseline command\ncomparison command'])('copies %s and reports success', async (command) => {
    writeText.mockResolvedValue(undefined);

    await copyGcxCommandToClipboard(command, messages);

    expect(writeText).toHaveBeenCalledWith(command);
    expect(reportInteraction).toHaveBeenCalledWith('g_pyroscope_app_export_profile', { format: 'gcx' });
    expect(displaySuccess).toHaveBeenCalledWith([messages.success]);
    expect(displayError).not.toHaveBeenCalled();
  });

  it('reports clipboard failures without reporting success', async () => {
    const error = new Error('Permission denied');
    writeText.mockRejectedValue(error);

    await copyGcxCommandToClipboard('command', messages);

    expect(displayError).toHaveBeenCalledWith(error, [messages.error, error.message]);
    expect(displaySuccess).not.toHaveBeenCalled();
    expect(reportInteraction).not.toHaveBeenCalled();
  });
});
