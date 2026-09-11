import { TimeRange } from '@grafana/data';
import { t } from '@grafana/i18n';
import { SceneComponentProps, sceneGraph, SceneObjectBase, SceneObjectState } from '@grafana/scenes';
import { Button, Dropdown, Menu } from '@grafana/ui';
import { displayError } from '@shared/domain/displayStatus';
import { reportInteraction } from '@shared/domain/reportInteraction';
import { saveProfileJsonToFile } from '@shared/domain/saveProfileJsonToFile';
import { useMaxNodesFromUrl } from '@shared/domain/url-params/useMaxNodesFromUrl';
import { useIsFlameGraphCanvasPresent } from '@shared/domain/useIsFlameGraphCanvasPresent';
import { DEFAULT_SETTINGS } from '@shared/infrastructure/settings/PluginSettings';
import { useFetchPluginSettings } from '@shared/infrastructure/settings/useFetchPluginSettings';
import { DomainHookReturnValue } from '@shared/types/DomainHookReturnValue';
import { FlamebearerProfile } from '@shared/types/FlamebearerProfile';
import 'compression-streams-polyfill';
import saveAs from 'file-saver';
import React from 'react';

import { ProfilesDataSourceVariable } from '../../../../domain/variables/ProfilesDataSourceVariable';
import { ProfileApiClient } from '../../../../infrastructure/profiles/ProfileApiClient';
import { DataSourceProxyClientBuilder } from '../../../../infrastructure/series/http/DataSourceProxyClientBuilder';
import { PprofApiClient } from '../../infrastructure/PprofApiClient';
import { getExportFilename } from './domain/getExportFilename';
import { flamegraphDotComApiClient } from './infrastructure/flamegraphDotComApiClient';

interface SceneExportMenuState extends SceneObjectState {}

type ExtraProps = {
  query: string;
  timeRange: TimeRange;
};

export class SceneExportMenu extends SceneObjectBase<SceneExportMenuState> {
  constructor() {
    super({ key: 'export-flame-graph-menu' });
  }

  async fetchFlamebearerProfile({
    dataSourceUid,
    query,
    timeRange,
    maxNodes,
  }: ExtraProps & { dataSourceUid: string; maxNodes: number | null }): Promise<FlamebearerProfile | null> {
    const profileApiClient = DataSourceProxyClientBuilder.build(dataSourceUid, ProfileApiClient);

    let profile;

    try {
      profile = await profileApiClient.get({
        query,
        timeRange,
        format: 'json',
        maxNodes: maxNodes || DEFAULT_SETTINGS.maxNodes,
      });
    } catch (error) {
      displayError(error as Error, [
        t('export-menu.error-loading-profile', 'Error while loading flamebearer profile data!'),
        (error as Error).message,
      ]);
      return null;
    }

    return profile as FlamebearerProfile;
  }

  async fetchPprofProfile({
    dataSourceUid,
    query,
    timeRange,
    maxNodes,
  }: ExtraProps & { dataSourceUid: string; maxNodes: number | null }): Promise<Blob | null> {
    const pprofApiClient = DataSourceProxyClientBuilder.build(dataSourceUid, PprofApiClient);

    let profile;

    try {
      const blob = await pprofApiClient.selectMergeProfile({
        query,
        timeRange,
        maxNodes: maxNodes || DEFAULT_SETTINGS.maxNodes,
      });
      profile = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
    } catch (error) {
      displayError(error as Error, [
        t('export-menu.error-pprof', 'Failed to export to pprof!'),
        (error as Error).message,
      ]);
      return null;
    }

    return profile;
  }

  useSceneExportMenu = ({ query, timeRange }: ExtraProps): DomainHookReturnValue => {
    const dataSourceUid = sceneGraph.findByKeyAndType(this, 'dataSource', ProfilesDataSourceVariable).useState()
      .value as string;

    const [maxNodes] = useMaxNodesFromUrl();
    const { settings } = useFetchPluginSettings();

    const downloadPng = () => {
      reportInteraction('g_pyroscope_app_export_profile', { format: 'png' });

      const filename = `${getExportFilename(query, timeRange)}.png`;

      const canvasElement = document.querySelector('canvas[data-testid="flameGraph"]') as HTMLCanvasElement | null;

      if (!canvasElement) {
        const error = new Error('No flame graph canvas found, the image cannot be created.');
        displayError(error, [
          t('export-menu.error-png', 'Failed to export to png!'),
          t('export-menu.error-png-no-canvas', 'Please ensure the flame graph is visible before exporting to png.'),
        ]);
        return;
      }

      canvasElement.toBlob((blob) => {
        if (!blob) {
          const error = new Error('Error while creating the image, no blob.');
          displayError(error, [t('export-menu.error-png', 'Failed to export to png!'), error.message]);
          return;
        }

        saveAs(blob, filename);
      }, 'image/png');
    };

    const downloadJson = async () => {
      reportInteraction('g_pyroscope_app_export_profile', { format: 'json' });

      const profile = await this.fetchFlamebearerProfile({ dataSourceUid, query, timeRange, maxNodes });
      if (!profile) {
        return;
      }

      const filename = `${getExportFilename(query, timeRange)}.json`;
      try {
        saveProfileJsonToFile(profile, filename);
      } catch (error) {
        displayError(error as Error, ['Failed to export to JSON!', (error as Error).message]);
      }
    };

    const downloadPprof = async () => {
      reportInteraction('g_pyroscope_app_export_profile', { format: 'pprof' });

      const profile = await this.fetchPprofProfile({ dataSourceUid, query, timeRange, maxNodes });
      if (!profile) {
        return;
      }

      const filename = `${getExportFilename(query, timeRange)}.pb.gz`;

      saveAs(profile, filename);
    };

    const uploadToFlamegraphDotCom = async () => {
      reportInteraction('g_pyroscope_app_export_profile', { format: 'flamegraph.com' });

      const profile = await this.fetchFlamebearerProfile({ dataSourceUid, query, timeRange, maxNodes });
      if (!profile) {
        return;
      }

      try {
        const response = await flamegraphDotComApiClient.upload(getExportFilename(query, timeRange), profile);

        if (!response.url) {
          throw new Error('Empty URL received.');
        }

        const dlLink = document.createElement('a');
        dlLink.target = '_blank';
        dlLink.href = response.url;
        document.body.appendChild(dlLink);
        dlLink.click();
        document.body.removeChild(dlLink);
      } catch (error) {
        displayError(error as Error, [
          t('export-menu.error-flamegraph-com', 'Failed to export to flamegraph.com!'),
          (error as Error).message,
        ]);
        return;
      }
    };

    // png export captures the flame graph <canvas>, which is not rendered in the "Top table" view
    const isPngExportDisabled = !useIsFlameGraphCanvasPresent();

    return {
      data: {
        shouldDisplayFlamegraphDotCom: Boolean(settings?.enableFlameGraphDotComExport),
        isPngExportDisabled,
      },
      actions: {
        downloadPng,
        downloadJson,
        downloadPprof,
        uploadToFlamegraphDotCom,
      },
    };
  };

  static Component = ({ model, query, timeRange }: SceneComponentProps<SceneExportMenu> & ExtraProps) => {
    const { data, actions } = model.useSceneExportMenu({ query, timeRange });

    return (
      <Dropdown
        overlay={
          <Menu>
            <Menu.Item
              label={t('export-menu.png', 'png')}
              disabled={data.isPngExportDisabled}
              description={
                data.isPngExportDisabled
                  ? t('export-menu.png-disabled-description', 'Switch to the flame graph view to export it as a png')
                  : undefined
              }
              onClick={actions.downloadPng}
            />
            <Menu.Item label={t('export-menu.json', 'json')} onClick={actions.downloadJson} />
            <Menu.Item label={t('export-menu.pprof', 'pprof')} onClick={actions.downloadPprof} />
          </Menu>
        }
      >
        <Button
          icon="download-alt"
          size="sm"
          variant="secondary"
          fill="outline"
          aria-label={t('export-menu.aria-label', 'Export profile data')}
          tooltip={t('export-menu.tooltip', 'Export profile data')}
        />
      </Dropdown>
    );
  };
}
