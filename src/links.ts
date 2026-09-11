import { PluginExtensionAddedLinkConfig, PluginExtensionPoints, RawTimeRange } from '@grafana/data';
import { DataQuery } from '@grafana/schema';
import { GrafanaPyroscopeDataQuery } from '@grafana/schema/dist/esm/raw/composable/grafanapyroscope/dataquery/x/GrafanaPyroscopeDataQuery_types.gen';
import { parseRawFilters } from '@shared/components/QueryBuilder/domain/helpers/queryToFilters';

export type PluginExtensionExploreContext = {
  targets: DataQuery[];
  timeRange: RawTimeRange;
  explorationType?: string;
};

type URLParamsBuilderProps = {
  pyroscopeQuery: GrafanaPyroscopeDataQuery;
  timeRange?: RawTimeRange;
  explorationType?: string;
};

// Helper function to extract additional labels (preserving operators)
function extractAdditionalLabels(labelSelector: string): string[] {
  const scenesDelimiter = '|';

  return parseRawFilters(labelSelector)
    .filter(([name]) => name !== 'service_name')
    .map(([name, op, value]) => `${name}${scenesDelimiter}${op}${scenesDelimiter}${value}`);
}

/**
 * Builds a base URL for datasource-only navigation (fallback case)
 * Used when no service name or profile type is specified - shows overview of all services
 * @param datasourceUid - Pyroscope datasource UID
 * @param timeRange - Optional time range for the query
 * @returns Complete URL for 'all services' exploration type
 */
function buildBaseURL(datasourceUid: string, timeRange?: RawTimeRange): string {
  const baseParams = new URLSearchParams();
  baseParams.append('var-dataSource', datasourceUid);
  baseParams.append('explorationType', 'all');
  if (timeRange) {
    baseParams.append('from', timeRange.from.toString());
    baseParams.append('to', timeRange.to.toString());
  }
  return `/a/grafana-pyroscope-app/explore?${baseParams.toString()}`;
}

/**
 * Determines the appropriate exploration type based on available data
 * Follows Profiles Drilldown hierarchy: explicit type > service-based type > default
 * @param serviceName - Extracted service name from labelSelector
 * @param explorationType - Explicit exploration type override
 * @returns Exploration type: 'labels' if service name present, 'all' otherwise, or explicit override
 */
function determineExplorationTypeFromQuery(serviceName?: string, explorationType?: string): string {
  if (explorationType) {
    return explorationType;
  }
  return serviceName ? 'labels' : 'all';
}

function addCoreParams(
  params: string[],
  pyroscopeQuery: GrafanaPyroscopeDataQuery,
  finalExplorationType: string,
  serviceName: string | undefined
): void {
  params.push(`var-dataSource=${pyroscopeQuery.datasource?.uid}`);
  if (serviceName) {
    params.push(`var-serviceName=${serviceName}`);
  }
  params.push(`var-profileMetricId=${pyroscopeQuery.profileTypeId}`);
  params.push(`explorationType=${finalExplorationType}`);
}

function addTimeRangeParams(params: string[], timeRange: RawTimeRange | undefined): void {
  if (timeRange) {
    params.push(`from=${timeRange.from.toString()}`);
    params.push(`to=${timeRange.to.toString()}`);
  }
}

/**
 * Normalizes `spanSelector` to an array: the type declares `Array<string>`, but Grafana's
 * Trace View passes a single string, which satisfies `?.length` and then throws on `.join()`.
 */
function normalizeSpanSelector(spanSelector: unknown): string[] {
  if (Array.isArray(spanSelector)) {
    return spanSelector;
  }

  return typeof spanSelector === 'string' && spanSelector.length > 0 ? [spanSelector] : [];
}

function addQueryParams(params: string[], pyroscopeQuery: GrafanaPyroscopeDataQuery): void {
  const spanSelector = normalizeSpanSelector(pyroscopeQuery.spanSelector);
  if (spanSelector.length) {
    params.push(`var-spanSelector=${spanSelector.join(',')}`);
  }

  if (pyroscopeQuery.maxNodes) {
    params.push(`maxNodes=${pyroscopeQuery.maxNodes}`);
  }
}

function shouldAddFilters(finalExplorationType: string): boolean {
  return finalExplorationType === 'labels' || finalExplorationType === 'flame-graph';
}

function addFilterParams(
  params: string[],
  finalExplorationType: string,
  pyroscopeQuery: GrafanaPyroscopeDataQuery
): void {
  if (!shouldAddFilters(finalExplorationType) || !pyroscopeQuery.labelSelector) {
    return;
  }

  const additionalLabels = extractAdditionalLabels(pyroscopeQuery.labelSelector);
  if (additionalLabels.length) {
    params.push(`var-filters=${additionalLabels.join(',')}`);
  }
}

function addOptionalParams(
  params: string[],
  pyroscopeQuery: GrafanaPyroscopeDataQuery,
  timeRange: RawTimeRange | undefined,
  finalExplorationType: string
): void {
  addTimeRangeParams(params, timeRange);
  addQueryParams(params, pyroscopeQuery);
  addFilterParams(params, finalExplorationType, pyroscopeQuery);
}

/**
 * Builds all URL parameters systematically based on query data and exploration type
 * @param pyroscopeQuery - Complete Pyroscope query object
 * @param timeRange - Time range for the query
 * @param finalExplorationType - Determined exploration type
 * @param serviceName - Extracted service name for service-specific parameters
 * @returns URL parameter string ready for URLSearchParams
 */
function buildURLParams(
  pyroscopeQuery: GrafanaPyroscopeDataQuery,
  timeRange: RawTimeRange | undefined,
  finalExplorationType: string,
  serviceName: string | undefined
): string {
  const params: string[] = [];

  addCoreParams(params, pyroscopeQuery, finalExplorationType, serviceName);
  addOptionalParams(params, pyroscopeQuery, timeRange, finalExplorationType);

  return params.join('&');
}

/**
 * Main URL builder for Profiles Drilldown navigation
 *
 * Flow:
 * 1. Check for datasource-only fallback case (no service/profile specified)
 * 2. Extract service name from labelSelector using regex
 * 3. Determine appropriate exploration type based on available data
 * 4. Build all URL parameters systematically
 * 5. Construct final URL with proper encoding
 *
 * @param props - URLParamsBuilderProps containing pyroscope query, time range, and optional exploration type
 * @returns Complete URL for Profiles Drilldown app navigation
 */
export function buildURL(props: URLParamsBuilderProps) {
  const { timeRange, pyroscopeQuery, explorationType } = props;

  // Base URL fallback for datasource-only context
  if (!pyroscopeQuery.profileTypeId && !pyroscopeQuery.labelSelector?.includes('service_name')) {
    return buildBaseURL(pyroscopeQuery.datasource?.uid || '', timeRange);
  }

  const serviceName = pyroscopeQuery.labelSelector?.match(/service_name="([^"]+)"/)?.[1];
  const finalExplorationType = determineExplorationTypeFromQuery(serviceName, explorationType);
  const urlParams = buildURLParams(pyroscopeQuery, timeRange, finalExplorationType, serviceName);

  return `/a/grafana-pyroscope-app/explore?${new URLSearchParams(urlParams).toString()}`;
}

export const EXPLORE_TOOLBAR_ACTION: PluginExtensionAddedLinkConfig<PluginExtensionExploreContext> = {
  targets: [PluginExtensionPoints.ExploreToolbarAction, 'grafana-assistant-app/navigateToDrilldown/v1'],
  title: 'Open in Grafana Profiles Drilldown',
  icon: 'fire',
  description: 'Try our new queryless experience for profiles',
  path: '/a/grafana-pyroscope-app/explore',
  configure(context: PluginExtensionExploreContext | undefined) {
    if (!context || !context.targets || !context.timeRange || context.targets.length > 1) {
      return undefined;
    }

    const firstQuery = context.targets[0];

    if (firstQuery.datasource && firstQuery.datasource.type === 'grafana-pyroscope-datasource') {
      return {
        path: buildURL({
          pyroscopeQuery: firstQuery as GrafanaPyroscopeDataQuery,
          timeRange: context.timeRange,
          explorationType: context.explorationType, // Pass explorationType if present
        }),
      };
    }
    return undefined;
  },
};

export const TRACEVIEW_DETAILS_ACTION: PluginExtensionAddedLinkConfig<any> = {
  targets: ['grafana/traceview/details'],
  title: 'Open in Grafana Profiles Drilldown',
  description: 'Try our new queryless experience for profiles',
  path: '/a/grafana-pyroscope-app/explore',
  onClick: (_, { context }) => {
    if (!context || !context.serviceName || !context.spanSelector || !context.profileTypeId || !context.timeRange) {
      return;
    }

    const serviceName = context.serviceName;
    const spanSelector = context.spanSelector;
    const profileTypeId = context.profileTypeId;
    const timeRange = context.timeRange;

    const pyroscopeQuery: GrafanaPyroscopeDataQuery = {
      refId: 'span-flamegraph-profiles-drilldown-refId',
      labelSelector: `service_name="${serviceName}"`,
      profileTypeId,
      spanSelector,
      datasource: context.datasource,
      groupBy: ['service_name'],
      includeExemplars: false,
      includeHeatmap: false,
      heatmapType: 'individual',
    };

    if (pyroscopeQuery.datasource) {
      const path = buildURL({
        pyroscopeQuery: pyroscopeQuery,
        timeRange,
        explorationType: 'flame-graph',
      });
      window.open(path, '_blank', 'noopener,noreferrer');
    }
    return undefined;
  },
};
