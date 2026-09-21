import { css } from '@emotion/css';
import { SceneComponentProps, SceneObject, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { Button, IconName, useStyles2 } from '@grafana/ui';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { getProfileMetric, ProfileMetricId } from '@shared/infrastructure/profile-metrics/getProfileMetric';
import { merge } from 'lodash';
import React from 'react';

import { GridItemData } from '../../components/SceneByVariableRepeaterGrid/types/GridItemData';
import { getSceneVariableValue } from '../../helpers/getSceneVariableValue';
import { interpolateQueryRunnerVariables } from '../../infrastructure/helpers/interpolateQueryRunnerVariables';
import { EventExpandPanel, EventExpandPanelPayload } from '../events/EventExpandPanel';
import { EventSelectLabel, EventSelectLabelPayload } from '../events/EventSelectLabel';
import { EventViewServiceFlameGraph, EventViewServiceFlameGraphPayload } from '../events/EventViewServiceFlameGraph';
import { EventViewServiceLabels, EventViewServiceLabelsPayload } from '../events/EventViewServiceLabels';
import { EventViewServiceProfiles, EventViewServiceProfilesPayload } from '../events/EventViewServiceProfiles';

type ActionType = 'expand-panel' | 'select-label' | 'view-flame-graph' | 'view-labels' | 'view-profiles';

type EventLookup = {
  icon?: IconName;
  label?: string;
  ariaLabel?: string;
  tooltip: (item: GridItemData, model: SceneObject) => string;
  EventConstructor:
    | (new (payload: EventExpandPanelPayload) => EventExpandPanel)
    | (new (payload: EventSelectLabelPayload) => EventSelectLabel)
    | (new (payload: EventViewServiceFlameGraphPayload) => EventViewServiceFlameGraph)
    | (new (payload: EventViewServiceLabelsPayload) => EventViewServiceLabels)
    | (new (payload: EventViewServiceProfilesPayload) => EventViewServiceProfiles);
};

const Events = new Map<ActionType, EventLookup>([
  [
    'expand-panel',
    Object.freeze({
      ariaLabel: 'Expand panel',
      icon: 'expand-arrows',
      tooltip: () => 'Expand this panel to view all the data for the current filters',
      EventConstructor: EventExpandPanel,
    }),
  ],
  [
    'select-label',
    Object.freeze({
      label: 'Select',
      tooltip: ({ queryRunnerParams }) => `View "${queryRunnerParams.groupBy?.label}" values breakdown`,
      EventConstructor: EventSelectLabel,
    }),
  ],
  [
    'view-flame-graph',
    Object.freeze({
      ariaLabel: 'Flame graph',
      icon: 'fire',
      tooltip: ({ queryRunnerParams }, model) => {
        const serviceName = queryRunnerParams.serviceName || getSceneVariableValue(model, 'serviceName');
        const profileMetricId = queryRunnerParams.profileMetricId || getSceneVariableValue(model, 'profileMetricId');
        return `View the "${getProfileMetric(profileMetricId as ProfileMetricId).type}" flame graph of ${serviceName}`;
      },
      EventConstructor: EventViewServiceFlameGraph,
    }),
  ],
  [
    'view-labels',
    Object.freeze({
      label: 'Labels',
      icon: 'tag-alt',
      tooltip: ({ queryRunnerParams }, model) => {
        const serviceName = queryRunnerParams.serviceName || getSceneVariableValue(model, 'serviceName');
        return `Explore the labels of ${serviceName}`;
      },
      EventConstructor: EventViewServiceLabels,
    }),
  ],
  [
    'view-profiles',
    Object.freeze({
      label: 'Profile types',
      icon: 'gf-grid',
      tooltip: ({ queryRunnerParams }, model) => {
        const serviceName = queryRunnerParams.serviceName || getSceneVariableValue(model, 'serviceName');
        return `View the profile types of ${serviceName}`;
      },
      EventConstructor: EventViewServiceProfiles,
    }),
  ],
]);

interface SelectActionState extends SceneObjectState {
  type: ActionType;
  EventConstructor: EventLookup['EventConstructor'];
  item: GridItemData;
  label?: string;
  ariaLabel?: string;
  icon?: IconName;
  tooltip?: EventLookup['tooltip'];
  skipVariablesInterpolation?: boolean;
}

export class SelectAction extends SceneObjectBase<SelectActionState> {
  constructor({
    type,
    item,
    tooltip,
    skipVariablesInterpolation,
  }: {
    type: ActionType;
    item: SelectActionState['item'];
    tooltip?: SelectActionState['tooltip'];
    skipVariablesInterpolation?: SelectActionState['skipVariablesInterpolation'];
  }) {
    const lookup = Events.get(type);
    if (!lookup) {
      throw new TypeError(`Unknown event type="${type}"!`);
    }

    super({ type, item, ...merge({}, lookup, { tooltip, skipVariablesInterpolation }) });
  }

  public onClick = () => {
    reportInteraction('g_pyroscope_app_select_action_clicked', { type: this.state.type });

    this.publishEvent(this.buildEvent(), true);
  };

  buildEvent() {
    const { EventConstructor, item, skipVariablesInterpolation } = this.state;

    const completeItem = {
      ...item,
      queryRunnerParams: skipVariablesInterpolation
        ? item.queryRunnerParams
        : interpolateQueryRunnerVariables(this, item),
    };

    return new EventConstructor({
      item: completeItem,
    });
  }

  public static Component = ({ model }: SceneComponentProps<SelectAction>) => {
    const styles = useStyles2(getStyles);
    const { ariaLabel, label, icon, tooltip, item } = model.useState();
    const accessibleName = ariaLabel || label || '';
    const tooltipText = tooltip?.(item, model) ?? accessibleName;

    // Icon-only actions must stay on `Button`. Grafana IconButton sets aria-label from `tooltip`,
    // which would replace names like "Flame graph" with the longer hover text and break E2E locators.
    return (
      <Button
        className={label ? styles.selectButton : styles.iconButton}
        aria-label={accessibleName}
        variant="secondary"
        size="sm"
        fill="text"
        onClick={model.onClick}
        icon={icon}
        tooltip={tooltipText}
        tooltipPlacement="top"
      >
        {label}
      </Button>
    );
  };
}

const getStyles = () => ({
  selectButton: css`
    margin: 0;
    padding: 0;
  `,
  iconButton: css`
    margin: 0;
  `,
});
