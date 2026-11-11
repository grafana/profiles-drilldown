import React from 'react';

import pluginJson from '../plugin.json';

export const Root = React.lazy(async () => {
  const { initPluginTranslations } = await import('@grafana/i18n');

  const { loadResources: scenesLoadResources } = await import('@grafana/scenes');
  await initPluginTranslations('grafana-scenes', [scenesLoadResources]);

  const { loadResources } = await import('../i18n/loadResources');
  await initPluginTranslations(pluginJson.id, [loadResources]);

  return import('./App').then((module) => ({ default: module.App }));
});
