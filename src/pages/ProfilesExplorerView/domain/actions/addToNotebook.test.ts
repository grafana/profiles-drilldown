import { dateTime } from '@grafana/data';
import { config } from '@grafana/runtime';
import {
  CustomVariable,
  EmbeddedScene,
  SceneDataTransformer,
  SceneQueryRunner,
  SceneTimeRange,
  SceneVariableSet,
  VizPanel,
} from '@grafana/scenes';
import { type MouseEvent } from 'react';

import pluginJson from '../../../../plugin.json';
import { SceneTimeseriesMenu } from '../../components/SceneLabelValuesTimeseries/SceneTimeseriesMenu';
import { ADD_TO_NOTEBOOK_COMPONENT_ID, captureNotebookContext, EventOpenAddToNotebook } from './addToNotebook';

jest.mock('../../components/SceneLabelValuesTimeseries/SceneLabelValuesTimeseries', () => ({
  SceneLabelValuesTimeseries: class {},
}));

function setup() {
  const menu = new SceneTimeseriesMenu({ includeAddToNotebook: true });
  const runner = new SceneQueryRunner({
    datasource: { uid: '${dataSource}', type: 'grafana-pyroscope-datasource' },
    queries: [
      {
        refId: 'A',
        queryType: 'metrics',
        profileTypeId: '${profileMetricId}',
        labelSelector: '{service_name="${serviceName}",environment="production"}',
        groupBy: ['region'],
        limit: 20,
        includeExemplars: true,
        privatePayload: 'private-profile-payload',
      },
    ],
  });
  const panel = new VizPanel({
    pluginId: 'timeseries',
    title: 'CPU',
    menu: menu as never,
    $data: new SceneDataTransformer({ $data: runner, transformations: [() => (source) => source] }),
  });
  const timeRange = new SceneTimeRange({ from: 'now-1h', to: 'now', timeZone: 'America/Los_Angeles' });
  const service = new CustomVariable({ name: 'serviceName', query: 'checkout', value: 'checkout', text: 'checkout' });
  const root = new EmbeddedScene({
    body: panel,
    $timeRange: timeRange,
    $variables: new SceneVariableSet({
      variables: [
        service,
        new CustomVariable({
          name: 'dataSource',
          query: 'pyroscope-production',
          value: 'pyroscope-production',
          text: 'pyroscope-production',
        }),
        new CustomVariable({
          name: 'profileMetricId',
          query: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
          value: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
          text: 'CPU',
        }),
      ],
    }),
  });
  return { panel, menu, root, timeRange, service, runner };
}

function readContext(text: string) {
  return JSON.parse(text.split('\n\n')[1]);
}

describe('notebook query context', () => {
  const originalPermissions = config.bootData.user.permissions;
  beforeEach(() => {
    config.bootData.user.permissions = { 'notebooks:create': true };
  });
  afterEach(() => {
    config.bootData.user.permissions = originalPermissions;
  });

  it('declares the exact v2 host dependency', () => {
    expect(pluginJson.dependencies.extensions.exposedComponents).toContain(ADD_TO_NOTEBOOK_COMPONENT_ID);
  });

  it('snapshots only resolved query context on menu selection, never a fake chart or profile', () => {
    const { menu, root, service, timeRange, runner } = setup();
    service.changeValueTo('payments');
    const received = jest.fn();
    root.subscribeToEvent(EventOpenAddToNotebook, received);
    menu
      .buildMenuItems()
      .find((item) => item.text === 'Add query context to notebook')
      ?.onClick?.({} as MouseEvent);
    expect(received).toHaveBeenCalledTimes(1);
    const capture = received.mock.calls[0][0].payload;
    expect(capture.defaultTitle).toBe('Profiles Drilldown query context');
    expect(capture.cells).toHaveLength(1);
    expect(capture.cells[0].kind).toBe('markdown');
    expect(capture.cells[0].text).toContain('Context only:');
    const context = readContext(capture.cells[0].text);
    expect(context).toEqual({
      datasourceUid: 'pyroscope-production',
      query: {
        refId: 'A',
        queryType: 'metrics',
        profileTypeId: 'process_cpu:cpu:nanoseconds:cpu:nanoseconds',
        labelSelector: '{service_name="payments",environment="production"}',
        groupBy: ['region'],
        limit: 20,
      },
      capturedTimeRange: { from: 'now-1h', to: 'now', timeZone: 'America/Los_Angeles' },
    });
    expect(capture.cells[0].text).not.toContain('private-profile-payload');
    expect(capture.cells[0].text).not.toContain('includeExemplars');
    const href = capture.cells[0].text.match(/\]\((.*)\)$/)[1];
    const panes = JSON.parse(new URL(href, 'http://localhost').searchParams.get('panes')!);
    expect(panes['pyroscope-explore'].queries).toEqual([{ ...context.query, datasource: 'pyroscope-production' }]);
    expect(panes['pyroscope-explore'].range).toEqual({ from: 'now-1h', to: 'now' });
    service.changeValueTo('different');
    runner.state.queries[0].groupBy.push('changed');
    timeRange.setState({ from: 'now-24h' });
    expect(readContext(capture.cells[0].text)).toEqual(context);
  });

  it('preserves absolute raw time as ISO plus source timezone', () => {
    const { panel, timeRange } = setup();
    timeRange.setState({
      value: {
        ...timeRange.state.value,
        raw: { from: dateTime('2026-10-05T08:00:00Z'), to: dateTime('2026-10-05T09:00:00Z') },
      },
    });
    expect(readContext(captureNotebookContext(panel)!.cells[0].text).capturedTimeRange).toEqual({
      from: '2026-10-05T08:00:00.000Z',
      to: '2026-10-05T09:00:00.000Z',
      timeZone: 'America/Los_Angeles',
    });
  });

  it('normalizes absolute string bounds to ISO with the same source timezone', () => {
    const { panel, root } = setup();
    root.setState({
      $timeRange: new SceneTimeRange({
        from: '2026-10-05T01:00:00-07:00',
        to: '2026-10-05T02:00:00-07:00',
        timeZone: 'America/Los_Angeles',
      }),
    });
    expect(readContext(captureNotebookContext(panel)!.cells[0].text).capturedTimeRange).toEqual({
      from: '2026-10-05T08:00:00.000Z',
      to: '2026-10-05T09:00:00.000Z',
      timeZone: 'America/Los_Angeles',
    });
  });

  it('hides without extension/permissions, allows write OR create, rechecks permission on click', () => {
    const { menu, root } = setup();
    const hasItem = () => menu.buildMenuItems().some((item) => item.text === 'Add query context to notebook');
    menu.setState({ includeAddToNotebook: false });
    expect(hasItem()).toBe(false);
    menu.setState({ includeAddToNotebook: true });
    config.bootData.user.permissions = {};
    expect(hasItem()).toBe(false);
    config.bootData.user.permissions = { 'notebooks:write': true };
    expect(hasItem()).toBe(true);
    const item = menu.buildMenuItems().find((item) => item.text === 'Add query context to notebook');
    const received = jest.fn();
    root.subscribeToEvent(EventOpenAddToNotebook, received);
    config.bootData.user.permissions = {};
    item?.onClick?.({} as MouseEvent);
    expect(received).not.toHaveBeenCalled();
  });

  it('excludes flamegraphs, missing datasource and multiple/unsupported queries', () => {
    const { panel, runner, menu } = setup();
    panel.setState({ pluginId: 'flamegraph' });
    expect(captureNotebookContext(panel)).toBeUndefined();
    panel.setState({ pluginId: 'timeseries' });
    const originalQuery = runner.state.queries[0];
    runner.setState({ queries: [originalQuery, { ...originalQuery, refId: 'B' }] });
    expect(captureNotebookContext(panel)).toBeUndefined();
    expect(menu.buildMenuItems().some((item) => item.text === 'Add query context to notebook')).toBe(false);
    runner.setState({ queries: [originalQuery] });
    runner.setState({ datasource: undefined });
    expect(captureNotebookContext(panel)).toBeUndefined();
    runner.setState({ datasource: { uid: 'pyroscope' }, queries: [{ refId: 'A', queryType: 'profile' }] });
    expect(captureNotebookContext(panel)).toBeUndefined();
  });
});
