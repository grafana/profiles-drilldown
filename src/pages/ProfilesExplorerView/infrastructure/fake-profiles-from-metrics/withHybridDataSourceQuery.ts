import { DataFrame, DataQuery, Field, LoadingState } from '@grafana/data';
import { sceneGraph, SceneObject, SceneQueryRunner } from '@grafana/scenes';

import { buildFakeTimeSeriesQuery } from './buildFakeTimeSeriesQuery';
import { findFakeMetricMapping } from './metricsProfileTypeMap';
import { resolveDataSourceKind } from './resolveDataSourceKind';

export type HybridQueryParams = {
  serviceName?: string;
  profileMetricId?: string;
  groupBy?: { label: string };
  /** Raw (uninterpolated) `${varname.filterExpressionWithLeadingComma}` tokens for the ad hoc filter variables in scope. */
  filtersExpr?: string;
  /** Names of the ad hoc filter variables `filtersExpr` references, so changes to them re-run the fake query too. */
  filterVariableNames?: string[];
};

// Exposed so callers that build a runner only to copy its `.state.queries` elsewhere (it's never activated) can still get the right shape.
export function resolveHybridQueries(
  sceneObject: SceneObject,
  params: HybridQueryParams,
  realQueries: DataQuery[]
): DataQuery[] {
  const dataSourceUid = sceneGraph.interpolate(sceneObject, '$dataSource');

  if (resolveDataSourceKind(dataSourceUid) !== 'prometheus') {
    return realQueries;
  }

  const serviceName = params.serviceName || sceneGraph.interpolate(sceneObject, '$serviceName');
  const profileMetricId = params.profileMetricId || sceneGraph.interpolate(sceneObject, '$profileMetricId');
  const extraSelector = params.filtersExpr ? sceneGraph.interpolate(sceneObject, params.filtersExpr) : '';
  const fakeTarget = buildFakeTimeSeriesQuery({ serviceName, profileMetricId, groupBy: params.groupBy, extraSelector });

  return fakeTarget ? [fakeTarget] : [];
}

function withUnit(field: Field, unit: string): Field {
  return field.name === 'Time' || field.config?.unit === unit ? field : { ...field, config: { ...field.config, unit } };
}

function applyFakeUnitToSeries(series: DataFrame[], unit: string): DataFrame[] {
  return series.map((frame) => ({ ...frame, fields: frame.fields.map((field) => withUnit(field, unit)) }));
}

export function withHybridDataSourceQuery(queryRunner: SceneQueryRunner, params: HybridQueryParams) {
  const realQueries = queryRunner.state.queries;

  queryRunner.addActivationHandler(() => {
    // Forces a re-run for the fake query (a resolved string with no `$var` tokens for Scenes to watch) on every call, including the first activation.
    const applyAndRun = () => {
      const queries = resolveHybridQueries(queryRunner, params, realQueries);

      if (queries !== queryRunner.state.queries) {
        queryRunner.setState({ queries });
      }

      const dataSourceUid = sceneGraph.interpolate(queryRunner, '$dataSource');
      if (resolveDataSourceKind(dataSourceUid) === 'prometheus') {
        queryRunner.runQueries();
      }
    };

    applyAndRun();

    // Only watch serviceName/profileMetricId when not passed literally: those are resolved live and can be transiently empty on first activation.
    const variableNames = [
      'dataSource',
      ...(params.serviceName ? [] : ['serviceName']),
      ...(params.profileMetricId ? [] : ['profileMetricId']),
      ...(params.filterVariableNames ?? []),
    ];
    const subscriptions = variableNames
      .map((name) => sceneGraph.lookupVariable(name, queryRunner)?.subscribeToState(applyAndRun))
      .filter((subscription): subscription is NonNullable<typeof subscription> => Boolean(subscription));

    // The real Prometheus datasource carries no unit, so patch it in from the mapping (e.g. "cores" for CPU rather than the "ns" profile-metrics.json lists, since that's for a real profile, not a rate() over a Prometheus counter).
    const unitSub = queryRunner.subscribeToState((newState) => {
      const data = newState.data;
      if (data?.state !== LoadingState.Done || !data.series?.length) {
        return;
      }

      const dataSourceUid = sceneGraph.interpolate(queryRunner, '$dataSource');
      if (resolveDataSourceKind(dataSourceUid) !== 'prometheus') {
        return;
      }

      const profileMetricId = params.profileMetricId || sceneGraph.interpolate(queryRunner, '$profileMetricId');
      const unit = findFakeMetricMapping(profileMetricId)?.unit;
      const alreadyApplied =
        !unit || data.series.every((frame) => frame.fields.every((field) => withUnit(field, unit) === field));

      if (!alreadyApplied) {
        queryRunner.setState({ data: { ...data, series: applyFakeUnitToSeries(data.series, unit) } });
      }
    });

    return () => {
      subscriptions.forEach((subscription) => subscription.unsubscribe());
      unitSub.unsubscribe();
    };
  });

  return queryRunner;
}
