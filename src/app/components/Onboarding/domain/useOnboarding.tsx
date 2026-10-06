import { ApiClient } from '@shared/infrastructure/http/ApiClient';
import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { useState } from 'react';
import { useAsync } from 'react-use';

import { useFetchTenantStats } from '../infrastructure/useFetchTenantStats';

export function useOnboarding(): DomainHookReturnValue {
  const [isModalClosed, setIsModalClosed] = useState(false);
  const {
    value: datasources,
    loading: dsLoading,
    error: dsError,
  } = useAsync(() => ApiClient.getPyroscopeDataSources());

  const pyroscopeDataSourcesCount = datasources?.settings.length ?? 0;
  const { isFetching, error, stats } = useFetchTenantStats({ enabled: pyroscopeDataSourcesCount > 0 });
  const hasNoUserData = !isFetching && !stats?.hasIngestedData;

  return {
    data: {
      shouldShowLoadingPage: !error && !dsError && (isFetching || dsLoading),
      shouldShowOnboardingPage: (error || dsError || !pyroscopeDataSourcesCount || hasNoUserData) && !isModalClosed,
      shouldShowNoDataSourceBanner: !pyroscopeDataSourcesCount,
    },
    actions: {
      closeModal() {
        setIsModalClosed(true);
      },
    },
  };
}
