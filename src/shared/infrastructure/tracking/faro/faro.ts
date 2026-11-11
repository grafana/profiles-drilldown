import { Faro, getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk';
import { config, getAppPluginVersion } from '@grafana/runtime';

import { PLUGIN_BASE_URL, PYROSCOPE_APP_ID } from '../../../../constants';
import { GIT_COMMIT } from '../../../../version';
import { getFaroEnvironment } from './getFaroEnvironment';
import { registerFaroInteractionEchoBackend } from './interactionEchoBackend';

let faro: Faro | null = null;

export const getFaro = () => faro;
export const setFaro = (instance: Faro | null) => (faro = instance);

export async function initFaro() {
  if (getFaro()) {
    return;
  }

  const faroEnvironment = getFaroEnvironment();
  if (!faroEnvironment) {
    return;
  }

  const { environment, faroUrl, appName } = faroEnvironment;

  const { bootData, buildInfo } = config;

  const appRelease = (await getAppPluginVersion(PYROSCOPE_APP_ID)) ?? '';
  const userEmail = bootData.user.email;
  const grafanaVersion = `v${buildInfo.version} (${buildInfo.edition})`;

  setFaro(
    initializeFaro({
      url: faroUrl,
      app: {
        name: appName,
        release: appRelease,
        version: GIT_COMMIT,
        environment,
        namespace: grafanaVersion, // :man_shrug:
      },
      user: {
        email: userEmail,
      },
      instrumentations: [
        ...getWebInstrumentations({
          captureConsole: false,
        }),
      ],
      isolate: true,
      beforeSend: (event) => {
        if ((event.meta.page?.url ?? '').includes(PLUGIN_BASE_URL)) {
          event.meta.view = {
            name: new URLSearchParams(event.meta.page?.url).get('explorationType') || '',
          };

          return event;
        }

        return null;
      },
    })
  );

  // mirror this plugin's reportInteraction events into faro
  registerFaroInteractionEchoBackend();
}
