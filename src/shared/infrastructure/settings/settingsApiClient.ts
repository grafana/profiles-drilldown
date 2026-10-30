import { DataSourceProxyClient } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/DataSourceProxyClient';

import { PluginSettings } from './PluginSettings';

type ApiResponse = {
  settings: Array<{ name: string; value: string }>;
};

export class SettingsApiClient extends DataSourceProxyClient {
  static PLUGIN_SETTING_NAME = 'pluginSettings';

  async get(): Promise<PluginSettings> {
    return super
      .fetch('/settings.v1.SettingsService/Get', { method: 'POST', body: JSON.stringify({}) })
      .then((response) => response.json())
      .then((json: ApiResponse) => {
        const setting = json.settings?.find(({ name }) => name === SettingsApiClient.PLUGIN_SETTING_NAME);

        if (!setting) {
          return {};
        }

        return JSON.parse(setting.value);
      });
  }

  async set(newSettings: PluginSettings) {
    return super
      .fetch('/settings.v1.SettingsService/Set', {
        method: 'POST',
        body: JSON.stringify({
          setting: {
            name: SettingsApiClient.PLUGIN_SETTING_NAME,
            value: JSON.stringify(newSettings),
          },
        }),
      })
      .then((response) => response.json());
  }
}
