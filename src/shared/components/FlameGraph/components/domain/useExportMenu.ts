import { t } from '@grafana/i18n';
import { displayError } from '@shared/domain/displayStatus';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { saveProfileJsonToFile } from '@shared/domain/saveProfileJsonToFile';
import { useIsFlameGraphCanvasPresent } from '@shared/domain/useIsFlameGraphCanvasPresent';
import 'compression-streams-polyfill';
import saveAs from 'file-saver';

import { ExportDataProps } from '../ExportData';
import { flamegraphDotComApiClient } from '../infrastructure/flamegraphDotComApiClient';
import { getExportFilename } from './getExportFilename';

/* Note: no pprof export, as the underlying API only accepts a single query (see PprofApiClient) */
export function useExportMenu({ profile, enableFlameGraphDotComExport }: ExportDataProps) {
  const downloadPng = () => {
    reportInteraction('g_pyroscope_app_export_profile', { format: 'png' });

    const customExportName = getExportFilename(profile.metadata.appName);
    const filename = `${customExportName}.png`;

    // TODO use ref, this won't work for comparison side by side (??!)
    const canvasElement = document.querySelector('canvas[data-testid="flameGraph"]') as HTMLCanvasElement | null;

    if (!canvasElement) {
      const error = new Error('No flame graph canvas found, the image cannot be created.');
      displayError(error, [
        t('export-menu.error-png', 'Failed to export to png!'),
        t('export-menu.error-png-no-canvas', 'Please ensure the flame graph is visible before exporting to png.'),
      ]);
      return;
    }

    canvasElement.toBlob((blob) => {
      if (!blob) {
        const error = new Error('No Blob, the image cannot be created.');
        displayError(error, [t('export-menu.error-png', 'Failed to export to png!'), error.message]);
        return;
      }

      saveAs(blob, filename);
    }, 'image/png');
  };

  const downloadJson = () => {
    reportInteraction('g_pyroscope_app_export_profile', { format: 'json' });

    const customExportName = getExportFilename(profile.metadata.appName);
    const filename = `${customExportName}.json`;

    try {
      saveProfileJsonToFile(profile, filename);
    } catch (error) {
      displayError(error as Error, ['Failed to export to JSON!', (error as Error).message]);
    }
  };

  const uploadToFlamegraphDotCom = async () => {
    reportInteraction('g_pyroscope_app_export_profile', { format: 'flamegraph.com' });

    const customExportName = getExportFilename(profile.metadata.appName);

    let response;

    try {
      response = await flamegraphDotComApiClient.upload(customExportName, profile);
    } catch (error) {
      displayError(error as Error, ['Failed to export to flamegraph.com!', (error as Error).message]);
      return;
    }

    const dlLink = document.createElement('a');
    dlLink.target = '_blank';
    dlLink.href = response.url;
    document.body.appendChild(dlLink);
    dlLink.click();
    document.body.removeChild(dlLink);
  };

  // png export captures the flame graph <canvas>, which is not rendered in the "Top table" view
  const isPngExportDisabled = !useIsFlameGraphCanvasPresent();

  return {
    data: {
      shouldDisplayFlamegraphDotCom: Boolean(enableFlameGraphDotComExport),
      isPngExportDisabled,
    },
    actions: {
      downloadPng,
      downloadJson,
      uploadToFlamegraphDotCom,
    },
  };
}
