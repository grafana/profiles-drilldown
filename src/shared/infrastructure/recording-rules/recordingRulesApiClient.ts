import { create } from '@bufbuild/protobuf';
import {
  ListRecordingRulesResponse,
  MetricType,
  RecordingRule,
  StacktraceFilterFunctionNameSchema,
  StacktraceFilterSchema,
  UpsertRecordingRuleRequest,
} from '@shared/pyroscope-api/settings/v1/recording_rules_pb';
import { RecordingRuleViewModel } from '@shared/types/RecordingRuleViewModel';
import { DataSourceProxyClient } from 'src/pages/ProfilesExplorerView/infrastructure/series/http/DataSourceProxyClient';

function mapRuleToRecordingRuleViewModel(rule: RecordingRule): RecordingRuleViewModel {
  let serviceName = '';
  for (let matcher of rule.matchers || []) {
    if (matcher.includes('service_name=')) {
      serviceName = matcher?.match(/service_name="([^"]+)"/)?.[1] || '';
      break;
    }
  }

  const functionName = rule.stacktraceFilter?.functionName?.functionName;

  return {
    id: rule.id,
    metricName: rule.metricName,
    serviceName,
    profileType: rule.profileType,
    matchers: rule.matchers,
    groupBy: rule.groupBy || [],
    functionName,
    readonly: rule.provisioned,
  };
}

export class RecordingRulesApiClient extends DataSourceProxyClient {
  async get(): Promise<RecordingRuleViewModel[]> {
    return super
      .fetch('/settings.v1.RecordingRulesService/ListRecordingRules', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      .then((response) => response.json())
      .then((json: ListRecordingRulesResponse) => {
        if (!json.rules) {
          return [];
        }
        return json.rules.map((rule: RecordingRule) => {
          return mapRuleToRecordingRuleViewModel(rule);
        });
      });
  }

  async create(rule: RecordingRuleViewModel): Promise<void> {
    const basicMatchers = rule.serviceName ? [`{ service_name="${rule.serviceName}" }`] : [];

    let requestBody: UpsertRecordingRuleRequest = {
      metricName: rule.metricName,
      matchers: [...basicMatchers, `{ __profile_type__="${rule.profileType}"}`, ...(rule.matchers || [])],
      groupBy: rule.groupBy || [],
    } as UpsertRecordingRuleRequest;

    // Add stacktrace filter if function name is provided
    if (rule.functionName) {
      requestBody.stacktraceFilter = create(StacktraceFilterSchema, {
        functionName: create(StacktraceFilterFunctionNameSchema, {
          functionName: rule.functionName,
          metricType: MetricType.TOTAL,
        }),
      });
    }

    return super
      .fetch('/settings.v1.RecordingRulesService/UpsertRecordingRule', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      })
      .then((response) => response.json());
  }

  async remove(rule: RecordingRuleViewModel): Promise<void> {
    return super
      .fetch('/settings.v1.RecordingRulesService/DeleteRecordingRule', {
        method: 'POST',
        body: JSON.stringify({
          id: rule.id,
        }),
      })
      .then((response) => response.json());
  }
}
