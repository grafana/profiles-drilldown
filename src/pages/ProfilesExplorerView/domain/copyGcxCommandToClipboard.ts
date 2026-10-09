import { displayError, displaySuccess } from '@shared/domain/displayStatus';
import { reportInteraction } from '@shared/domain/reportInteraction';

export async function copyGcxCommandToClipboard(
  command: string,
  messages: { success: string; error: string }
): Promise<void> {
  try {
    await navigator.clipboard.writeText(command);
    reportInteraction('g_pyroscope_app_export_profile', { format: 'gcx' });
    displaySuccess([messages.success]);
  } catch (error) {
    displayError(error as Error, [messages.error, (error as Error).message]);
  }
}
