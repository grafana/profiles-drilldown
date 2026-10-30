import { t } from '@grafana/i18n';
import { Alert, LoadingPlaceholder } from '@grafana/ui';
import React from 'react';

import { DataSourceUidState } from './DataSourceUidContext';
import { getMissingUidError } from './getMissingUidError';

interface DataSourceUidFallbackProps {
  dataSourceState: DataSourceUidState;
}

/** Rendered by entry points while the UID is missing: still loading, or failed. */
export function DataSourceUidFallback({ dataSourceState }: DataSourceUidFallbackProps) {
  const { loading, error } = dataSourceState;

  if (loading) {
    return <LoadingPlaceholder text={t('datasource-context.loading', 'Selecting datasource...')} />;
  }

  return (
    <Alert severity="error" title={t('datasource-context.error-title', 'Unable to select datasource')}>
      {(error ?? getMissingUidError()).message}
    </Alert>
  );
}
