import { useDefaultDataSourceUid } from '@shared/infrastructure/datasource/useDefaultDataSourceUid';
import { usePyroscopeDataSources } from '@shared/infrastructure/datasource/useSelectDefaultDataSourceUid';
import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { useState } from 'react';

import { useFetchTenantStats } from '../infrastructure/useFetchTenantStats';

export function useOnboarding(): DomainHookReturnValue {
  const { datasources, error: dsError, loading: dsLoading } = usePyroscopeDataSources();
  const { error: defaultError, loading: defaultLoading, uid: dataSourceUid = '' } = useDefaultDataSourceUid();
  const [isModalClosed, setIsModalClosed] = useState(false);

  const pyroscopeDataSourcesCount = datasources?.length ?? 0;
  // useFetchTenantStats already skips the query when dataSourceUid is empty
  const { isFetching, error, stats } = useFetchTenantStats({ enabled: pyroscopeDataSourcesCount > 0, dataSourceUid });
  const hasNoUserData = !isFetching && !stats?.hasIngestedData;

  const shouldShowLoadingPage = !error && !dsError && (isFetching || dsLoading || defaultLoading);
  const shouldShowOnboardingPage =
    (error || dsError || defaultError || !pyroscopeDataSourcesCount || hasNoUserData) && !isModalClosed;
  const shouldShowNoDataSourceBanner = !pyroscopeDataSourcesCount || !dataSourceUid;

  return {
    data: { shouldShowLoadingPage, shouldShowOnboardingPage, shouldShowNoDataSourceBanner },
    actions: {
      closeModal() {
        setIsModalClosed(true);
      },
    },
  };
}
