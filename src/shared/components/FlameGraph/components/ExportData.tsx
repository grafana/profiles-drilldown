import { t } from '@grafana/i18n';
import { Button, Dropdown } from '@grafana/ui';
import { FlamebearerProfile } from '@shared/types/FlamebearerProfile';
import React, { memo } from 'react';

import { ExportMenu } from './ExportMenu';

export type ExportDataProps = {
  profile: FlamebearerProfile;
  enableFlameGraphDotComExport?: boolean;
  onCopyGcxCommands?: () => void | Promise<void>;
};

function ExportDataComponent(props: ExportDataProps) {
  const { profile, enableFlameGraphDotComExport, onCopyGcxCommands } = props;

  return (
    <Dropdown
      overlay={
        <ExportMenu
          profile={profile}
          enableFlameGraphDotComExport={enableFlameGraphDotComExport}
          onCopyGcxCommands={onCopyGcxCommands}
        />
      }
    >
      <Button
        icon="download-alt"
        size="sm"
        variant="secondary"
        fill="outline"
        aria-label={t('export-data.aria-label', 'Export profile data')}
        tooltip={t('export-data.tooltip', 'Export profile data')}
      />
    </Dropdown>
  );
}

export const ExportData = memo(ExportDataComponent);
