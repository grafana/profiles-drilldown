import React, { createContext, ReactNode, useContext } from 'react';

export interface DataSourceUidState {
  uid: string | undefined;
  loading: boolean;
  error: Error | undefined;
}

const DataSourceUidContext = createContext<string | undefined>(undefined);

interface DataSourceUidProviderProps {
  uid: string;
  children: ReactNode;
}

export function DataSourceUidProvider({ uid, children }: DataSourceUidProviderProps) {
  return <DataSourceUidContext.Provider value={uid}>{children}</DataSourceUidContext.Provider>;
}

export function useDataSourceUid(): string {
  const uid = useContext(DataSourceUidContext);

  if (!uid) {
    throw new Error('useDataSourceUid must be used inside DataSourceUidProvider');
  }

  return uid;
}
