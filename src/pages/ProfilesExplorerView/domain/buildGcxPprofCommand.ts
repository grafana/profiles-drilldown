import { TimeRange } from '@grafana/data';
import { parseQuery } from '@shared/domain/url-params/parseQuery';

type BuildGcxPprofCommandOptions = {
  dataSourceUid: string;
  query: string;
  timeRange: TimeRange;
  maxNodes: number;
  filename: string;
  profileIds?: string[];
  spanIds?: string[];
};

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

export function buildGcxPprofCommand({
  dataSourceUid,
  query,
  timeRange,
  maxNodes,
  filename,
  profileIds = [],
  spanIds = [],
}: BuildGcxPprofCommandOptions) {
  const { profileMetricId, labelsSelector } = parseQuery(query);

  return [
    'gcx profiles query',
    `-d ${shellQuote(dataSourceUid)}`,
    shellQuote(labelsSelector),
    `--profile-type ${shellQuote(profileMetricId)}`,
    `--from ${shellQuote(timeRange.from.toISOString())}`,
    `--to ${shellQuote(timeRange.to.toISOString())}`,
    `--max-nodes ${maxNodes}`,
    ...profileIds.map((profileId) => `--profile-id ${shellQuote(profileId)}`),
    ...spanIds.map((spanId) => `--span-id ${shellQuote(spanId)}`),
    '-o pprof',
    `--pprof-path ${shellQuote(filename)}`,
  ].join(' ');
}
