import { displayError, displaySuccess } from '@shared/domain/displayStatus';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { useMaxNodesFromUrl } from '@shared/domain/url-params/useMaxNodesFromUrl';
import { DEFAULT_SETTINGS, PluginSettings } from '@shared/infrastructure/settings/PluginSettings';
import { useFetchPluginSettings } from '@shared/infrastructure/settings/useFetchPluginSettings';
import { useEffect, useState } from 'react';

export function useUISettingsView() {
  const { settings, error: fetchError, mutate } = useFetchPluginSettings();
  const setMaxNodes = useMaxNodesFromUrl()[1];
  const [currentSettings, setCurrentSettings] = useState<PluginSettings>(settings ?? DEFAULT_SETTINGS);

  useEffect(() => {
    if (settings) {
      setCurrentSettings(settings);
    }
  }, [settings]);

  return {
    data: {
      ...currentSettings,
      fetchError,
    },
    actions: {
      toggleCollapsedFlamegraphs() {
        setCurrentSettings((s) => ({
          ...s,
          collapsedFlamegraphs: !s.collapsedFlamegraphs,
        }));
      },
      updateMaxNodes(event: React.ChangeEvent<HTMLInputElement>) {
        setCurrentSettings((s) => ({
          ...s,
          maxNodes: Number(event.target.value),
        }));
      },
      toggleEnableFlameGraphDotComExport() {
        setCurrentSettings((s) => ({
          ...s,
          enableFlameGraphDotComExport: !s.enableFlameGraphDotComExport,
        }));
      },
      toggleEnableFunctionDetails() {
        setCurrentSettings((s) => ({
          ...s,
          enableFunctionDetails: !s.enableFunctionDetails,
        }));
      },
      toggleEnableMetricsFromProfiles() {
        setCurrentSettings((s) => ({
          ...s,
          enableMetricsFromProfiles: !s.enableMetricsFromProfiles,
        }));
      },
      async saveSettings() {
        setMaxNodes(currentSettings.maxNodes);

        try {
          await mutate(currentSettings);

          reportInteraction('g_pyroscope_app_settings_saved');
          displaySuccess(['Plugin settings successfully saved!']);
        } catch (error) {
          displayError(error as Error, [
            'Error while saving the plugin settings!',
            'Please try again later, sorry for the inconvenience.',
          ]);
        }
      },
    },
  };
}
