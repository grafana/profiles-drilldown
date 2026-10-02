import { AppPlugin } from '@grafana/data';
import { AppPluginSettings } from '@shared/types/AppPluginSettings';

import { SemanticConfigPage } from './app/components/SemanticConfig/SemanticConfigPage';
import { Root } from './app/Root';
import { SuspendedEmbeddedProfilesExploration } from './exposedComponents';
import { EmbeddedProfilesExplorationState } from './exposedComponents/types';
import { EXPLORE_TOOLBAR_ACTION, PluginExtensionExploreContext, TRACEVIEW_DETAILS_ACTION } from './links';

export const plugin = new AppPlugin<AppPluginSettings>()
  .addLink<PluginExtensionExploreContext>(EXPLORE_TOOLBAR_ACTION)
  .addLink<PluginExtensionExploreContext>(TRACEVIEW_DETAILS_ACTION)
  .setRootPage(Root)
  .addConfigPage({ id: 'semantic', title: 'Function Classification', body: SemanticConfigPage })
  .exposeComponent({
    id: 'grafana-pyroscope-app/embedded-profiles-exploration/v1',
    title: 'Embedded Profiles Exploration',
    description: 'A component that renders a profiles exploration view that can be embedded in other parts of Grafana.',
    component: SuspendedEmbeddedProfilesExploration as React.ComponentType<EmbeddedProfilesExplorationState>,
  });
