import { t } from '@grafana/i18n';
import { Menu, Tooltip } from '@grafana/ui';
import React from 'react';

import { useExportMenu } from './domain/useExportMenu';
import { ExportDataProps } from './ExportData';

export function ExportMenu(props: ExportDataProps) {
  const { data, actions } = useExportMenu(props);

  return (
    <Menu>
      <Menu.Item
        label={t('export-menu.png-label', 'png')}
        disabled={data.isPngExportDisabled}
        description={
          data.isPngExportDisabled
            ? t('export-menu.png-disabled-description', 'Switch to the flame graph view to export it as a png')
            : undefined
        }
        onClick={actions.downloadPng}
      />
      <Menu.Item label={t('export-menu.json-label', 'json')} onClick={actions.downloadJson} />
      {props.onCopyGcxCommands && (
        <>
          <Menu.Divider />
          <Tooltip
            content={t(
              'export-menu.gcx-commands-tooltip',
              'Copy the gcx commands to download the baseline and comparison profiles as pprof'
            )}
          >
            <Menu.Item
              icon="copy"
              label={t('export-menu.gcx-commands', 'gcx commands')}
              onClick={props.onCopyGcxCommands}
            />
          </Tooltip>
        </>
      )}
    </Menu>
  );
}
