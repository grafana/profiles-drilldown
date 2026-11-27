import { AdHocVariableFilter, TimeRange } from '@grafana/data';

import type { ExplorationType } from 'src/pages/ProfilesExplorerView/components/SceneProfilesExplorer/SceneProfilesExplorer';

export interface EmbeddedProfilesExplorationState {
  initialExplorationType?: `${ExplorationType}`;
  initialDS?: string;
  initialFilters?: AdHocVariableFilter[];
  initialAllServicesFilter?: AdHocVariableFilter[];
  initialTimeRange: TimeRange;
  onTimeRangeChange?: (timeRange: TimeRange) => void;
  returnToPreviousSource?: string;
}
