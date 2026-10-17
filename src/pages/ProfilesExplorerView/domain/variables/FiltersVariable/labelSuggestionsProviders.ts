import { MetricFindValue } from '@grafana/data';
import { AdHocFiltersVariable, AdHocFilterWithLabels, sceneGraph } from '@grafana/scenes';
import { Suggestion } from '@shared/components/QueryBuilder/domain/types';
import { buildFilterExpressionParts } from '@shared/components/SavedSearches/utils';
import { labelsRepository } from '@shared/infrastructure/labels/labelsRepository';
import { logger } from '@shared/infrastructure/tracking/logger';
import { DATA_SOURCE_VARIABLE, PROFILE_METRIC_VARIABLE } from 'src/constants';

import { computeRoundedTimeRange } from '../../../helpers/computeRoundedTimeRange';
import { LabelsApiClient } from '../../../infrastructure/labels/http/LabelsApiClient';

export const SUPPORTED_OPERATORS = ['=', '!=', '=~', '!~'];

interface SuggestionsRequest {
  dataSourceUid: string;
  query: string;
  from: number;
  to: number;
}

function getVariableValue(variable: AdHocFiltersVariable, name: string): string {
  return String(sceneGraph.lookupVariable(name, variable)?.getValue() ?? '');
}

function buildSuggestionsRequest(variable: AdHocFiltersVariable, excludedKey: string | null): SuggestionsRequest {
  const dataSourceUid = getVariableValue(variable, DATA_SOURCE_VARIABLE);

  if (!dataSourceUid) {
    throw new Error('Cannot load label suggestions: no data source selected!');
  }

  const profileMetricId = getVariableValue(variable, PROFILE_METRIC_VARIABLE);
  const otherFilters = variable.state.filters.filter((filter) => filter.key !== excludedKey);
  const { from, to } = computeRoundedTimeRange(sceneGraph.getTimeRange(variable).state.value);

  return {
    dataSourceUid,
    query: `${profileMetricId}{${buildFilterExpressionParts(otherFilters)}}`,
    from,
    to,
  };
}

function toMetricFindValue({ label, value }: Suggestion): MetricFindValue {
  return { text: label, value };
}

async function withErrorLogging(request: Promise<Suggestion[]>, info: string) {
  try {
    const values = (await request).map(toMetricFindValue);
    return { replace: true, values };
  } catch (error) {
    logger.error(error as Error, { info });
    throw error;
  }
}

export async function getTagKeysProvider(variable: AdHocFiltersVariable, currentKey: string | null) {
  const { dataSourceUid, query, from, to } = buildSuggestionsRequest(variable, currentKey);

  // setApiClient and listLabels must run in the same tick: labelsRepository is a shared singleton
  labelsRepository.setApiClient(new LabelsApiClient({ dataSourceUid }));

  return withErrorLogging(labelsRepository.listLabels({ query, from, to }), 'Error while loading label names!');
}

export async function getTagValuesProvider(variable: AdHocFiltersVariable, filter: AdHocFilterWithLabels) {
  const { dataSourceUid, query, from, to } = buildSuggestionsRequest(variable, filter.key);

  // setApiClient and listLabelValues must run in the same tick: labelsRepository is a shared singleton
  labelsRepository.setApiClient(new LabelsApiClient({ dataSourceUid }));

  return withErrorLogging(
    labelsRepository.listLabelValues({ label: filter.key, query, from, to }),
    'Error while loading label values!'
  );
}
