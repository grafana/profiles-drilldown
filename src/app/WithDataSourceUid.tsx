import { DataSourceUidProvider } from '@shared/infrastructure/datasource/DataSourceUidContext';
import { DataSourceUidFallback } from '@shared/infrastructure/datasource/DataSourceUidFallback';
import { useDefaultDataSourceUid } from '@shared/infrastructure/datasource/useDefaultDataSourceUid';
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

// Layout route, keyed by page so each page re-reads var-dataSource and the stored choice when it mounts
export function WithDataSourceUid() {
  const { pathname } = useLocation();

  return <DataSourceUidResolver key={pathname} />;
}

function DataSourceUidResolver() {
  const dataSourceState = useDefaultDataSourceUid();

  if (!dataSourceState.uid) {
    return <DataSourceUidFallback dataSourceState={dataSourceState} />;
  }

  return (
    <DataSourceUidProvider uid={dataSourceState.uid}>
      <Outlet />
    </DataSourceUidProvider>
  );
}
