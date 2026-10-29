import { SelectableValue } from '@grafana/data';
import { displayError } from '@shared/domain/displayStatus';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { useDataSourceUid } from '@shared/infrastructure/datasource/DataSourceUidContext';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdHocProfileClient } from '../infrastructure/adHocProfileClient';
import { AdHocProfile } from './AdHocProfile';

const DEFAULT_PROFILE_DATA: AdHocProfile = {
  id: '',
  name: '',
  profileTypes: [],
  profile: null,
};

export function useUploadFile() {
  const [isLoading, setIsLoading] = useState(false);
  const [profileData, setProfileData] = useState(DEFAULT_PROFILE_DATA);
  const dataSourceUid = useDataSourceUid();
  const client = useMemo(() => new AdHocProfileClient({ dataSourceUid }), [dataSourceUid]);

  useEffect(() => {
    return () => {
      client.abort();
    };
  }, [client]);

  const removeFile = useCallback(() => {
    client.abort();

    setIsLoading(false);
    setProfileData(DEFAULT_PROFILE_DATA);
  }, [client]);

  const processFile = useCallback(
    async (file: File) => {
      removeFile();
      reportInteraction('g_pyroscope_app_ad_hoc_file_dropped', { fileType: file.type });

      try {
        setIsLoading(true);

        const data = await client.uploadSingle(file);

        setProfileData(data);
        reportInteraction('g_pyroscope_app_ad_hoc_profile_upload_success', {
          fileType: file.type,
          profileTypeCount: data.profileTypes.length,
        });
      } catch (error) {
        if (client.isAbortError(error)) {
          return;
        }

        setProfileData(DEFAULT_PROFILE_DATA);

        const err = error as Error;
        reportInteraction('g_pyroscope_app_ad_hoc_profile_upload_failed', {
          fileType: file.type,
          errorName: err.name,
        });
        displayError(err, ['Error while uploading profile!', err.message]);
      }

      setIsLoading(false);
    },
    [client, removeFile]
  );

  const selectProfileType = useCallback(
    async (option: SelectableValue<string>) => {
      const profileType = option.value;

      if (!profileType || !profileData.id || !profileData.profileTypes.includes(profileType)) {
        return;
      }

      client.abort();
      setIsLoading(false);
      setProfileData((prevData) => ({ ...prevData, profile: null }));

      setIsLoading(true);

      try {
        const data = await client.get(profileData.id, profileType);

        setProfileData((prevData) => ({
          ...prevData,
          profile: data.profile,
        }));
      } catch (error) {
        if (client.isAbortError(error)) {
          return;
        }

        displayError(error as Error, ['Error while fetching profile!', (error as Error).message]);
      }

      setIsLoading(false);
    },
    [client, profileData.id, profileData.profileTypes]
  );

  return {
    id: profileData.id,
    processFile,
    profileTypes: profileData.profileTypes,
    selectProfileType,
    profile: profileData.profile,
    removeFile,
    isLoading,
  };
}
