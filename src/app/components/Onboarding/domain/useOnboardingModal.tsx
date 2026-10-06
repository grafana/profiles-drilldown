import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { useState } from 'react';

import { useFetchInstances } from '../infrastructure/useFetchInstances';

export function useOnboardingModal(): DomainHookReturnValue {
  const [settingsUrl, setSettingsUrl] = useState('https://grafana.com/auth/sign-in/');

  // DEMO HACK: force the cloud (3-step) copy regardless of host, so the flame graph placeholder's CTA always shows
  // the full "How to Get Started" flow for the demo recording.
  // Revert to: /\.grafana(-dev|-ops)?\.net$/.test(window.location.host) when the demo is done.
  const isCloud = true;
  const { instances } = useFetchInstances(isCloud);

  if (instances && instances.orgSlug && instances.hpInstanceId) {
    const newSettingsUrl = `https://grafana.com/orgs/${instances.orgSlug}/hosted-profiles/${instances.hpInstanceId}`;

    if (settingsUrl !== newSettingsUrl) {
      setSettingsUrl(newSettingsUrl);
    }
  }

  return {
    data: {
      settingsUrl,
      isCloud,
    },
    actions: {},
  };
}
