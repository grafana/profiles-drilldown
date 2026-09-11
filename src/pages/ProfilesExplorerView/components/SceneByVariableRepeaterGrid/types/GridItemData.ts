import { AdHocVariableFilter } from '@grafana/data';

import { PanelType } from '../components/ScenePanelTypeSwitcher';

export type GridItemData = {
  index: number; // for coloring purposes only
  value: string;
  label: string;
  queryRunnerParams: {
    serviceName?: string;
    profileMetricId?: string;
    groupBy?: {
      label: string;
      values: string[];
    };
    filters?: AdHocVariableFilter[];
    extraFilterVariables?: string[];
    profileIdSelector?: string;
    spanSelector?: string;
  };
  panelType: PanelType;
};
