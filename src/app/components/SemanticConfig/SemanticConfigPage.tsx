import React, { lazy, Suspense } from 'react';

import pluginJson from '../../../plugin.json';

const LazySemanticConfig = lazy(async () => {
  const { initPluginTranslations } = await import('@grafana/i18n');
  const { loadResources } = await import('../../../i18n/loadResources');
  await initPluginTranslations(pluginJson.id, [loadResources]);
  return import('./SemanticConfig').then((module) => ({ default: module.SemanticConfig }));
});

export function SemanticConfigPage() {
  return (
    <Suspense>
      <LazySemanticConfig />
    </Suspense>
  );
}
