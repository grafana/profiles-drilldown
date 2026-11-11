import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React, { ReactNode } from 'react';

import { DataSourceUidProvider } from '../DataSourceUidContext';

export function createDataSourceUidWrapper(uid: string, queryClient = new QueryClient()) {
  return function DataSourceUidWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <DataSourceUidProvider uid={uid}>{children}</DataSourceUidProvider>
      </QueryClientProvider>
    );
  };
}
