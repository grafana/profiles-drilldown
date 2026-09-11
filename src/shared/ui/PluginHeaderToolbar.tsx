import { css, cx } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { t } from '@grafana/i18n';
import { useChromeHeaderHeight, usePluginComponent } from '@grafana/runtime';
import { ButtonGroup, ClipboardButton, Dropdown, ErrorBoundary, Field, Icon, Menu, ToolbarButton, useStyles2 } from '@grafana/ui';
import { SaveSearchButton } from '@shared/components/SavedSearches/SaveSearchButton';
import { displayError } from '@shared/domain/displayStatus';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { useFlagMetricsFromProfiles } from '@shared/infrastructure/featureFlags/featureFlags';
import { useFetchPluginSettings } from '@shared/infrastructure/settings/useFetchPluginSettings';
import { PluginInfo } from './PluginInfo';
import React from 'react';

import {
  SceneProfilesExplorer,
  SceneProfilesExplorerState,
} from 'src/pages/ProfilesExplorerView/components/SceneProfilesExplorer/SceneProfilesExplorer';
import { usePluginHeaderToolbar } from 'src/pages/ProfilesExplorerView/components/SceneProfilesExplorer/components/domain/usePluginHeaderToolbar';
import { getShareableUrlText } from 'src/pages/ProfilesExplorerView/components/SceneProfilesExplorer/components/domain/builsShareableUrl';
import { ExplorationTypeSelector } from 'src/pages/ProfilesExplorerView/components/SceneProfilesExplorer/components/ui/ExplorationTypeSelector';

export type PluginHeaderToolbarProps = {
  model: SceneProfilesExplorer;
  explorationType: SceneProfilesExplorerState['explorationType'];
  controls: SceneProfilesExplorerState['controls'];
  body: SceneProfilesExplorerState['body'];
  $variables: SceneProfilesExplorerState['$variables'];
  loadSearchScene: SceneProfilesExplorerState['loadSearchScene'];
  onChangeExplorationType: (explorationType: string) => void;
  onCreateRecordingRule: () => void;
  isEmbedded?: boolean;
};

export function PluginHeaderToolbar(props: PluginHeaderToolbarProps) {
  const chromeHeaderHeight = useChromeHeaderHeight?.();
  const styles = useStyles2(getStyles, chromeHeaderHeight ?? 0, props.isEmbedded ?? false);

  const { data, actions } = usePluginHeaderToolbar(props);

  const { settings } = useFetchPluginSettings();
  const metricsFromProfiles = useFlagMetricsFromProfiles();

  const {
    explorationType,
    dataSourceVariable,
    timePickerControl,
    refreshPickerControl,
    sceneVariables,
    gridControls,
    serviceName,
    extraControls,
  } = data;

  type InsightsLauncherProps = {
    dataSourceUid: string;
    serviceName?: string;
  };
  const { component: InsightsLauncher } = usePluginComponent<InsightsLauncherProps>(
    'grafana-o11yinsights-app/insights-launcher/v1'
  );

  const metricsFromProfilesMenu = (
    <Menu>
      <Menu.Item
        ariaLabel={t('explorer.header.view-recording-rules', 'View recording rules')}
        label={t('explorer.header.view-recording-rules', 'View recording rules')}
        onClick={actions.onClickRecordingRules}
      />
      <Menu.Item
        ariaLabel={t('explorer.header.add-recording-rule', 'Add recording rule')}
        label={t('explorer.header.add-recording-rule', 'Add recording rule')}
        onClick={props.onCreateRecordingRule}
      />
    </Menu>
  );

  return (
    <div className={styles.header} data-testid="allControls">
      <div className={styles.appControls} data-testid="appControls">
        <div className={styles.appControlsLeft}>
          <ExplorationTypeSelector
            options={SceneProfilesExplorer.EXPLORATION_TYPE_OPTIONS}
            value={explorationType as string}
            onChange={actions.onChangeExplorationType}
          />
        </div>

        <div className={styles.appControlsRight}>
          {InsightsLauncher && (
            <ErrorBoundary>
              {({ error }) =>
                error ? undefined : (
                  <InsightsLauncher dataSourceUid={dataSourceVariable.getValueText()} serviceName={serviceName} />
                )
              }
            </ErrorBoundary>
          )}

          {!props.isEmbedded && <SaveSearchButton sceneRef={props.model} />}
          {!props.isEmbedded && props.loadSearchScene && (
            <props.loadSearchScene.Component model={props.loadSearchScene} />
          )}

          {timePickerControl && (
            <timePickerControl.Component key={timePickerControl.state.key} model={timePickerControl} />
          )}
          {refreshPickerControl && (
            <refreshPickerControl.Component key={refreshPickerControl.state.key} model={refreshPickerControl} />
          )}

          {!props.isEmbedded && (
            <ButtonGroup>
              {settings?.enableMetricsFromProfiles && metricsFromProfiles && (
                <Dropdown overlay={metricsFromProfilesMenu}>
                  <ToolbarButton
                    icon="gf-prometheus"
                    variant="canvas"
                    tooltip={t('explorer.header.recording-rules-tooltip', 'Recording rules')}
                    aria-label={t('explorer.header.recording-rules-tooltip', 'Recording rules')}
                  />
                </Dropdown>
              )}

              <ToolbarButton
                icon="upload"
                variant="canvas"
                tooltip={t('explorer.header.upload-tooltip', 'Upload ad hoc profiles')}
                onClick={actions.onClickAdHoc}
              />

              <ClipboardButton
                icon="share-alt"
                variant="secondary"
                fill="text"
                className={styles.toolbarClipboardButton}
                tooltip={t('explorer.header.share-tooltip', 'Copy shareable link to the clipboard')}
                getText={getShareableUrlText}
                onClipboardCopy={() => reportInteraction('g_pyroscope_app_share_link_clicked')}
                onClipboardError={(_text, error) => {
                  reportInteraction('g_pyroscope_app_share_link_clicked');
                  displayError(error as Error, [
                    t('explorer.header.share-error', 'Error while copying the shareable link to the clipboard!'),
                  ]);
                }}
              />

              <ToolbarButton
                icon="cog"
                variant="canvas"
                tooltip={t('explorer.header.settings-tooltip', 'View/edit tenant settings')}
                onClick={actions.onClickUserSettings}
              />

              <PluginInfo variant="canvas" />
            </ButtonGroup>
          )}
        </div>
      </div>

      <div id={`scene-controls-${explorationType}`} className={styles.sceneControls} data-testid="sceneControls">
        {!props.isEmbedded && (
          <Field
            label={dataSourceVariable.state.label}
            className={cx(styles.sceneVariable, dataSourceVariable.state.name)}
            data-testid={dataSourceVariable.state.name}
          >
            <dataSourceVariable.Component model={dataSourceVariable} />
          </Field>
        )}

        {sceneVariables.map((variable) => (
          <Field
            key={variable.state.name}
            label={
              variable.state.label === 'Filters' ? (
                <div className={styles.sceneVariableLabel}>
                  <Icon name="filter" className={styles.icon} />
                  {variable.state.label}
                </div>
              ) : (
                variable.state.label
              )
            }
            className={cx(styles.sceneVariable, variable.state.name)}
            data-testid={variable.state.name}
          >
            <variable.Component model={variable} />
          </Field>
        ))}

        {gridControls.map((control) => (
          <Field key={control.state.key} id={control.state.key} className={styles.gridControl} label="">
            <control.Component model={control} />
          </Field>
        ))}

        {extraControls?.map((control) => (
          <control.Component key={control.state.key} model={control} />
        ))}
      </div>
    </div>
  );
}

const getStyles = (theme: GrafanaTheme2, chromeHeaderHeight: number, isEmbedded: boolean) => ({
  header: css`
    background-color: ${isEmbedded ? theme.colors.background.primary : theme.colors.background.canvas};
    position: sticky;
    top: ${isEmbedded ? 0 : chromeHeaderHeight}px;
    z-index: 1;
    padding-bottom: ${theme.spacing(2)};
  `,
  appControls: css`
    display: flex;
    padding: ${theme.spacing(1)} 0;
    justify-content: space-between;
    gap: ${theme.spacing(2)};
    flex-flow: wrap;
  `,
  appControlsLeft: css`
    display: flex;
    gap: ${theme.spacing(1)};
  `,
  appControlsRight: css`
    display: flex;
    align-items: center;
    gap: ${theme.spacing(1)};

    /* TimeRangePicker defaults to right:0; open into the page so the docked nav does not clip it */
    [data-testid='data-testid TimePicker Overlay Content'] > section {
      right: auto;
      left: 0;
    }
  `,
  toolbarClipboardButton: css`
    && {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0;
      padding: 0 ${theme.spacing(1)} !important;
      height: auto !important;
      min-height: unset;
      min-width: unset;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      line-height: ${theme.components.height.md * theme.spacing.gridSize - 2}px;
      font-weight: ${theme.typography.fontWeightMedium};
      color: ${theme.colors.text.primary};
      background: ${theme.colors.secondary.main};

      &:hover:not(:disabled),
      &:focus:not(:disabled),
      &:focus-visible:not(:disabled) {
        color: ${theme.colors.text.primary};
        background: ${theme.colors.secondary.shade};
        border: none !important;
        box-shadow: none !important;
      }

      [class*='icon'] {
        margin: 0 !important;
      }
    }
  `,
  sceneControls: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
    padding: 0;
    margin-top: 20px;
  `,
  sceneVariable: css`
    display: flex;
    margin-bottom: 0;

    & #dataSource {
      width: ${theme.spacing(32)};
    }

    &.filters {
      flex: 1 1 0;
    }

    &.filtersAllServices {
      // Set to 2 to add priority over quick-filter.
      flex: 2 1 0;
    }

    &.compare-presets {
      margin-left: auto;
      text-align: right;
    }
  `,
  sceneVariableLabel: css`
    font-size: 12px;
    font-weight: 500;
    line-height: 15px;
    height: 15px;
    margin-bottom: 4px;
    color: ${theme.colors.text.primary};
    max-width: 480px;
  `,
  icon: css`
    display: inline-block;
    margin-right: 4px;
  `,
  gridControl: css`
    margin-bottom: 0;

    &#quick-filter {
      flex: 1 1 0;
      min-width: 112px;
    }
  `,
});
