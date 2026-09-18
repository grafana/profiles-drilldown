import { useMaxNodesFromUrl } from '@shared/domain/url-params/useMaxNodesFromUrl';
import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { PLUGIN_BASE_URL, ROUTES } from '../../../constants';
import { useSettingsExtensions } from './useSettingsExtensions';

export function useSettingsView() {
  const [maxNodesFromUrl] = useMaxNodesFromUrl();
  const [activeTab, setActiveTab] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();

  const referrerRef = useRef(location.state?.referrer);

  const { components, isLoading } = useSettingsExtensions();

  return {
    data: {
      activeTab,
      components,
      isLoading,
    },
    actions: {
      setActiveTab(tab: number) {
        setActiveTab(tab);
      },
      goBack() {
        if (!referrerRef.current) {
          navigate(`${PLUGIN_BASE_URL}${ROUTES.EXPLORE}`);
          return;
        }

        const backUrl = new URL(referrerRef.current);

        // when calling saveSettings() above, the new maxNodes value is set and the URL search parameter is updated (see useMaxNodesFromUrl.ts)
        if (maxNodesFromUrl) {
          backUrl.searchParams.set('maxNodes', String(maxNodesFromUrl));
        }

        navigate(`${backUrl.pathname}${backUrl.search}`);
      },
    },
  };
}
