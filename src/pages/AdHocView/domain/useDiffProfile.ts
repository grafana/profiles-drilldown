import { displayError } from '@shared/domain/displayStatus';
import { useDataSourceUid } from '@shared/infrastructure/datasource/DataSourceUidContext';
import { FlamebearerProfile } from '@shared/types/FlamebearerProfile';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdHocProfileClient } from '../infrastructure/adHocProfileClient';

export function useDiffProfile() {
  const [profileTypes, setProfileTypes] = useState<string[]>([]);
  const [profile, setProfile] = useState<FlamebearerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const dataSourceUid = useDataSourceUid();
  const client = useMemo(() => new AdHocProfileClient({ dataSourceUid }), [dataSourceUid]);

  useEffect(() => {
    return () => {
      client.abort();
    };
  }, [client]);

  const fetchDiff = useCallback(
    async (leftId: string, rightId: string, profileType?: string) => {
      client.abort();
      setProfile(null);
      setIsLoading(true);

      try {
        const data = await client.diff(leftId, rightId, profileType);

        setProfileTypes(data.profileTypes);
        setProfile(data.profile);
      } catch (error) {
        if (!client.isAbortError(error)) {
          displayError(error as Error, ['Error while computing diff!', (error as Error).message]);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [client]
  );

  const reset = useCallback(() => {
    client.abort();
    setProfile(null);
    setProfileTypes([]);
    setIsLoading(false);
  }, [client]);

  return { profileTypes, profile, isLoading, fetchDiff, reset };
}
